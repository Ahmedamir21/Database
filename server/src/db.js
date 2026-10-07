/**
 * The single door to SQL Server.
 *
 * The whole application talks to the database through this file, and every statement that
 * takes input takes it as a bound parameter (mssql request.input). Nothing else in the code
 * builds SQL text out of user data, which is what keeps the project free of SQL injection
 * and away from "the application reads tables directly": the rules that matter are enforced
 * by the procedures and the trigger inside the database.
 */
import sql from 'mssql';
import { config, databaseEnvMissing } from './config.js';

/**
 * There is no SQL Server to talk to, because the environment does not describe one.
 * The API never guesses a server: a deployment without DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD
 * says so (and names the variables) instead of trying "sa@localhost" for fifteen seconds.
 */
export class DatabaseNotConfiguredError extends Error {
  constructor(missing) {
    super(`The API has no SQL Server to talk to: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set in the environment.`);
    this.name = 'DatabaseNotConfiguredError';
    this.code = 'database_not_configured';
    this.status = 503;                       // a deployment problem, not a server crash
    this.details = { missing };
    this.missing = missing;
  }
}

let pool = null;
let connecting = null;
let keepAlive = null;

/**
 * Open the pool once, and reuse it for every request that this instance of the API answers.
 *
 * A serverless platform keeps a function instance alive after it answered, and sends the next
 * request to the same instance, so the pool here is exactly what should be reused: the second
 * request pays no connect. Two details make that safe:
 *
 *   * one connect at a time. Two requests that arrive together await the same promise.
 *   * an 'error' listener on the pool. A connection that dies while nobody is looking would
 *     otherwise be an uncaught exception, which on Vercel is reported as
 *     FUNCTION_INVOCATION_FAILED with no useful message; here it clears the pool and the next
 *     request opens a fresh one.
 */
export async function getPool() {
  const missing = databaseEnvMissing();
  if (missing.length) throw new DatabaseNotConfiguredError(missing);
  if (pool && pool.connected) return pool;
  if (connecting) return connecting;

  connecting = (async () => {
    const instance = new sql.ConnectionPool({
      server: config.db.server,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
        enableArithAbort: true,
      },
      pool: { max: config.db.poolMax, min: 0, idleTimeoutMillis: 30000 },
      connectionTimeout: config.db.connectionTimeout,
      requestTimeout: config.db.requestTimeout,
    });

    instance.on('error', (error) => {
      console.error(`[db] the connection pool reported an error: ${error.message}`);
      if (pool === instance) pool = null;
      Promise.resolve()
        .then(() => instance.close())
        .catch(() => { /* the pool is already gone */ });
    });

    const connected = await instance.connect();
    pool = connected;
    startKeepAlive();
    return connected;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Keep the pool from being suspended by an idle serverless platform.
 *
 * Off by default (DB_KEEP_ALIVE_SECONDS=0), because every interval costs one function call.
 * When it is on, one very small query per interval holds the TCP connection to SQL Server
 * open, so the first request after a quiet period does not wait for a new handshake.
 */
function startKeepAlive() {
  const seconds = config.db.keepAliveSeconds;
  if (!seconds || keepAlive) return;
  keepAlive = setInterval(() => {
    if (pool && pool.connected) {
      pool.request().query('SELECT 1 AS Awake').catch(() => { /* the error listener will clean up */ });
    }
  }, seconds * 1000);
  keepAlive.unref();               // a timer must never keep the process (or a test) alive
}

export async function closePool() {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/**
 * Bind the parameters of one call.
 *
 * The driver can guess the type of a value, but not the type of a NULL, so a NULL is bound
 * with an explicit type. The names used here are the same names that appear in
 * database/03_queries.sql (@Search, @SemesterId, ...).
 */
const NULL_TYPES = {
  SemesterId: sql.Int,
  StudentId: sql.Int,
  CourseId: sql.Int,
  SectionId: sql.Int,
  InstructorId: sql.Int,
  AdminId: sql.Int,
  UserId: sql.Int,
  EnrollmentId: sql.Int,
  DepartmentId: sql.Int,
  ProgramId: sql.Int,
  Level: sql.Int,
  CreditHours: sql.Int,
  DayOfWeek: sql.TinyInt,
  Capacity: sql.Int,
  IsActive: sql.Bit,
  IsPinned: sql.Bit,
  OnlyActive: sql.Int,
  Status: sql.Bit,
  Amount: sql.Decimal(10, 2),
  Score: sql.Decimal(5, 2),
  RegistrationOpen: sql.Bit,
};

function bind(request, params = {}) {
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (value === null) {
      request.input(name, NULL_TYPES[name] || sql.NVarChar(400), null);
    } else {
      request.input(name, value);
    }
  }
  return request;
}

/**
 * Run one parameterised statement.
 *   const rows = await query(SQL.A1_FIND_ACCOUNT_BY_EMAIL, { Email });
 * The placeholders in the text look like @Email, exactly as they are written in
 * database/03_queries.sql, so the two files can be compared side by side.
 */
export async function query(text, params = {}) {
  const poolInstance = await getPool();
  const request = bind(poolInstance.request(), params);
  const result = await request.query(text);
  return result.recordset;
}

/** run a statement that returns exactly one row (or null) */
export async function queryOne(text, params = {}) {
  const rows = await query(text, params);
  return rows.length ? rows[0] : null;
}

/** run a stored procedure: the registration rules live inside the database */
export async function execute(procedureName, params = {}) {
  const poolInstance = await getPool();
  const request = bind(poolInstance.request(), params);
  const result = await request.execute(procedureName);
  return {
    rows: result.recordset || [],
    rowsAffected: result.rowsAffected ? result.rowsAffected[0] : 0,
    returnValue: result.returnValue,
  };
}

/**
 * Several statements in one transaction. The callback receives a small object with the same
 * query / execute helpers, all bound to the transaction.
 */
export async function withTransaction(work) {
  const poolInstance = await getPool();
  const transaction = new sql.Transaction(poolInstance);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  const scoped = {
    query: async (text, params = {}) => {
      const request = bind(new sql.Request(transaction), params);
      const result = await request.query(text);
      return result.recordset;
    },
    queryOne: async (text, params = {}) => {
      const rows = await scoped.query(text, params);
      return rows.length ? rows[0] : null;
    },
    execute: async (procedureName, params = {}) => {
      const request = bind(new sql.Request(transaction), params);
      const result = await request.execute(procedureName);
      return { rows: result.recordset || [], rowsAffected: result.rowsAffected ? result.rowsAffected[0] : 0 };
    },
  };
  try {
    const value = await work(scoped);
    await transaction.commit();
    return value;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* the pool is already gone */ }
    throw error;
  }
}

export { sql };
