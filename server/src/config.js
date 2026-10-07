/**
 * Configuration of the Zewail Desk API.
 *
 * Every setting comes from the environment, so no password is ever written in the code.
 * .env.example lists the names; server/.env holds the local values and is git-ignored.
 *
 * Three rules that matter once the API runs somewhere else than a developer's laptop:
 *
 *   * nothing is guessed. When DB_SERVER, DB_NAME, DB_USER and DB_PASSWORD are not all
 *     present, the API does not silently fall back to "sa@localhost" - it answers with
 *     database_not_configured and names the variable that is missing (see src/db.js).
 *   * production is recognised by NODE_ENV=production AND by the VERCEL variable that the
 *     platform sets on every deployment, so a forgotten NODE_ENV cannot quietly downgrade
 *     a deployment (the cookie is still Secure, the JWT secret is still checked).
 *   * the browsers that may call the API with a session are listed explicitly: the
 *     CLIENT_ORIGIN values of the deployment plus the deployment's own addresses. The API
 *     never answers "Access-Control-Allow-Origin: *", because the session travels in a
 *     cookie.
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

function text(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

const environment = text(process.env.NODE_ENV) || 'development';
/** Vercel sets VERCEL=1 (and VERCEL_ENV) inside every deployment it builds */
const onVercel = process.env.VERCEL === '1' || Boolean(text(process.env.VERCEL_ENV));
const isProduction = environment === 'production' || onVercel;

/* ------------------------------------------------------------------ SQL Server ---------- */

/** the four variables without which there is no connection to talk about */
const DB_REQUIRED_ENV = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

/** the names (never the values) of the database variables that are not set */
export function databaseEnvMissing() {
  return DB_REQUIRED_ENV.filter((name) => !text(process.env[name]));
}

/* ------------------------------------------------------- who may call this API ----------- */

/**
 * The origins a browser page may come from. The client is allowed to live on
 *   * the Vite development server (development only), and
 *   * CLIENT_ORIGIN, which may list several addresses separated by commas, and
 *   * the deployment's own addresses, which Vercel publishes in VERCEL_URL,
 *     VERCEL_BRANCH_URL and VERCEL_PROJECT_PRODUCTION_URL.
 */
function collectOrigins() {
  const clean = (value) => value.trim().replace(/\/+$/, '');
  const configured = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(clean)
    .filter(Boolean);
  const own = [];
  for (const name of ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'VERCEL_URL']) {
    const host = text(process.env[name]);
    if (host) own.push(`https://${host.replace(/^https?:\/\//, '')}`);
  }
  if (!isProduction) {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173');
  }
  return [...new Set([...configured, ...own])];
}

export const allowedOrigins = collectOrigins();

/* --------------------------------------------------------------------- the settings ----- */

export const config = {
  env: environment,
  isProduction,
  platform: onVercel ? 'vercel' : 'node',
  port: int(process.env.PORT, 4000),

  db: {
    server: text(process.env.DB_SERVER) || 'localhost',
    port: int(process.env.DB_PORT, 1433),
    database: text(process.env.DB_NAME) || 'ZewailDesk',
    user: text(process.env.DB_USER) || 'sa',
    password: process.env.DB_PASSWORD || '',
    encrypt: bool(process.env.DB_ENCRYPT, false),      // a local SQL Server has no certificate
    trustServerCertificate: bool(process.env.DB_TRUST_CERT, true),
    poolMax: int(process.env.DB_POOL_MAX, 10),
    connectionTimeout: int(process.env.DB_CONNECTION_TIMEOUT, 15000),
    requestTimeout: int(process.env.DB_REQUEST_TIMEOUT, 20000),
    // 0 = off. A serverless platform suspends a function that gets no traffic and with it the
    // pool of connections inside it; a value in seconds keeps the pool warm by asking the
    // database for the time. It costs one function call per interval, so it is opt-in.
    keepAliveSeconds: int(process.env.DB_KEEP_ALIVE_SECONDS, 0),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-env',
    tokenMinutes: int(process.env.JWT_MINUTES, 480),   // one working day
    cookieName: text(process.env.COOKIE_NAME) || 'zewaildesk_session',
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
    // 'lax' is right when the pages and the API are served from the same site. A client on
    // its own domain (a separate Vercel project) needs COOKIE_SAMESITE=none, which browsers
    // only accept together with Secure - and the cookie is Secure in production.
    cookieSameSite: (text(process.env.COOKIE_SAMESITE) || 'lax').toLowerCase(),
    cookieDomain: text(process.env.COOKIE_DOMAIN) || undefined,
  },

  // what the platform says about this deployment. Vercel sets all of it, so any deployment
  // can be asked which revision it is running - see deploymentFacts() and /api/meta/health.
  deployment: {
    url: text(process.env.VERCEL_URL),
    branchUrl: text(process.env.VERCEL_BRANCH_URL),
    productionUrl: text(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    environment: text(process.env.VERCEL_ENV),
    commit: text(process.env.VERCEL_GIT_COMMIT_SHA),
    ref: text(process.env.VERCEL_GIT_COMMIT_REF),
    repo: text(process.env.VERCEL_GIT_REPO_SLUG)
      ? `${text(process.env.VERCEL_GIT_REPO_OWNER) || ''}/${text(process.env.VERCEL_GIT_REPO_SLUG)}`
      : null,
  },

  // the first address of allowedOrigins, kept for the start up log and for older callers
  clientOrigin: allowedOrigins[0] || 'http://localhost:5173',

  // The very first administrator. Used once, by scripts/seedAdmin.js, and then ignored:
  // after that an administrator creates the other administrators from inside the application.
  firstAdmin: {
    fullName: text(process.env.ADMIN_NAME) || 'System Administrator',
    email: text(process.env.ADMIN_EMAIL) || '',
    password: process.env.ADMIN_PASSWORD || '',
    position: text(process.env.ADMIN_POSITION) || 'System Administrator',
  },

  demo: {
    // only used by the "sample data" screen of the client, never by the login code
    password: text(process.env.DEMO_PASSWORD) || 'Desk#2025',
  },
};

/* ------------------------------------------------------------------------ the checks ---- */

/**
 * What is wrong with JWT_SECRET, or null when the secret is good enough to sign a session.
 * A short or example secret is a real risk: anybody can mint a token for any account.
 */
export function jwtSecretProblem() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) return 'JWT_SECRET is not set';
  if (secret === 'change-me-in-env' || /^change[-_ ]?me/i.test(secret)) {
    return 'JWT_SECRET still has the example value';
  }
  if (secret.length < 32) return 'JWT_SECRET is shorter than 32 characters';
  return null;
}

/** Everything that will not work, said in one place, at start up and on /api/meta/health. */
export function configWarnings() {
  const warnings = [];
  const missing = databaseEnvMissing();
  if (missing.length) {
    warnings.push(`the database is not configured (missing ${missing.join(', ')}), so every screen that reads SQL Server answers database_not_configured`);
  }
  const secret = jwtSecretProblem();
  if (secret) warnings.push(`${secret}; signing in is refused until it is set in the environment`);
  if (isProduction && !config.db.encrypt) {
    warnings.push('DB_ENCRYPT is false: the traffic between the API and SQL Server is not encrypted. Set DB_ENCRYPT=true (and DB_TRUST_CERT=false when the server has a real certificate) for a deployment.');
  }
  const crossSite = crossSiteClientWarning();
  if (crossSite) warnings.push(crossSite);
  return warnings;
}

/**
 * The session travels in a cookie. When the pages are served by another site than the API
 * (typical: two Vercel projects), the browser only sends that cookie with SameSite=None,
 * and it only accepts SameSite=None together with Secure - which production always is.
 */
function crossSiteClientWarning() {
  const host = (origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return null;
    }
  };
  const ownHosts = ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'VERCEL_URL']
    .map((name) => text(process.env[name]))
    .filter(Boolean);
  const foreign = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((value) => host(value.trim()))
    .filter((value) => value && !ownHosts.includes(value)
      && !value.startsWith('localhost') && !value.startsWith('127.0.0.1'));
  if (!foreign.length || config.auth.cookieSameSite === 'none') return null;
  return `the client runs on ${foreign.join(', ')}, which is not an address of this deployment: set COOKIE_SAMESITE=none, or the session cookie will not be sent`;
}

export function assertConfigForStartup() {
  return configWarnings();
}

/**
 * The facts of the deployment, without the empty ones: which revision is running, on which
 * branch, in which environment, and which address the project calls its production domain.
 * /api/meta/health and the index of the API answer with this, so a probe (or a person with a
 * browser) can tell a deployment built from the right commit from a stale one - without any
 * access to the Vercel dashboard.
 */
export function deploymentFacts() {
  const { commit, ref, environment, url, productionUrl, branchUrl, repo } = config.deployment;
  const short = commit ? commit.slice(0, 7) : null;
  return Object.fromEntries(Object.entries({
    commit: short, ref, environment, url, productionUrl, branchUrl, repo,
  }).filter(([, value]) => value));
}

/** a short description of the connection for the health endpoint, without the password */
export function describeDatabase() {
  if (databaseEnvMissing().length) return null;
  return `${config.db.user}@${config.db.server}:${config.db.port}/${config.db.database}`;
}
