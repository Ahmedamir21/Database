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
import { config } from './config.js';

let pool = null;

/** open the pool once, reuse it for every request */
export async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool({
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
  }).connect();
  return pool;
}

export async function closePool() {
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
