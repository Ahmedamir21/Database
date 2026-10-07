/**
 * Configuration of the Zewail Desk API.
 *
 * Every setting comes from the environment, so no password is ever written in the code.
 * .env.example lists the names; server/.env holds the real values and is git-ignored.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),

  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: int(process.env.DB_PORT, 1433),
    database: process.env.DB_NAME || 'ZewailDesk',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    encrypt: bool(process.env.DB_ENCRYPT, false),      // local SQL Server: no certificate
    trustServerCertificate: bool(process.env.DB_TRUST_CERT, true),
    poolMax: int(process.env.DB_POOL_MAX, 10),
    connectionTimeout: int(process.env.DB_CONNECTION_TIMEOUT, 15000),
    requestTimeout: int(process.env.DB_REQUEST_TIMEOUT, 20000),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-env',
    tokenMinutes: int(process.env.JWT_MINUTES, 480),   // one working day
    cookieName: process.env.COOKIE_NAME || 'zewaildesk_session',
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
  },

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // The very first administrator. Used once, by scripts/seedAdmin.js, and then ignored:
  // after that an administrator creates the other administrators from inside the application.
  firstAdmin: {
    fullName: process.env.ADMIN_NAME || 'System Administrator',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    position: process.env.ADMIN_POSITION || 'System Administrator',
  },

  demo: {
    // only used by the "demo data" screen of the client, never by the login code
    password: process.env.DEMO_PASSWORD || 'Desk#2025',
  },
};

export function assertConfigForStartup() {
  const problems = [];
  if (!config.db.password) problems.push('DB_PASSWORD is missing');
  if (config.env === 'production' && config.auth.jwtSecret === 'change-me-in-env') {
    problems.push('JWT_SECRET has to be set to a long random value in production');
  }
  if (config.env === 'production' && !config.firstAdmin.password && process.env.ALLOW_NO_ADMIN !== '1') {
    // the first admin is only needed until one exists; the warning is not fatal for the API itself
    problems.push('ADMIN_PASSWORD is not set (only needed by npm run seed:admin)');
  }
  return problems;
}

/** a short description of the connection for the health endpoint, without the password */
export function describeDatabase() {
  return `${config.db.user}@${config.db.server}:${config.db.port}/${config.db.database}`;
}
