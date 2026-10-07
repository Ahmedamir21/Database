/**
 * Small routes that any signed in user needs: the semesters to choose from, the size of the
 * sample data, and a health check that tells whether the API can reach SQL Server.
 *
 * The health check is the first thing a marker (or a deployment check) looks at, so it is
 * careful about three different situations, and it never reveals a password:
 *
 *   200  api up, database up          - with the response time and the connection description
 *   503  database_not_configured      - the deployment has no DB_* variables: details.missing
 *                                       names the variables, so the fix is one dashboard page
 *   503  database_unreachable         - the variables are there but SQL Server does not answer
 */
import { Router } from 'express';
import * as SQL from '../sql/statements.js';
import { query, queryOne, DatabaseNotConfiguredError } from '../db.js';
import { ok, route } from '../http/respond.js';
import { requireAuth } from '../middleware/auth.js';
import {
  config, configWarnings, databaseEnvMissing, describeDatabase,
} from '../config.js';
import { reportCount } from '../services/reportService.js';

export const metaRouter = Router();

/** public: the numbers of the sample data, so the sign in page can say what is inside */
metaRouter.get('/summary', route(async (req, res) => {
  const counts = await queryOne(SQL.S3_PUBLIC_SUMMARY);
  return ok(res, { counts, reports: reportCount });
}));

/** public: is the database reachable? never reveals a password */
metaRouter.get('/health', route(async (req, res) => {
  const started = Date.now();
  const common = {
    api: 'up',
    environment: config.env,
    platform: config.platform,
    runtime: `node ${process.versions.node}`,
    warnings: configWarnings(),
  };
  const missing = databaseEnvMissing();

  if (missing.length) {
    return res.status(503).json({
      ok: false,
      error: {
        code: 'database_not_configured',
        message: 'The API is running, but this deployment has no SQL Server to talk to: database environment variables are missing.',
        details: {
          ...common,
          database: 'not configured',
          connection: null,
          missing,
          milliseconds: Date.now() - started,
        },
      },
    });
  }

  try {
    await queryOne(SQL.S3_PUBLIC_SUMMARY);
    return ok(res, {
      ...common,
      database: 'up',
      connection: describeDatabase(),      // user@server:port/database - no password, ever
      encrypted: config.db.encrypt,
      milliseconds: Date.now() - started,
    });
  } catch (error) {
    const notConfigured = error instanceof DatabaseNotConfiguredError
      || error?.code === 'database_not_configured';
    return res.status(503).json({
      ok: false,
      error: {
        code: notConfigured ? 'database_not_configured' : 'database_unreachable',
        message: notConfigured
          ? 'The API is running, but this deployment has no SQL Server to talk to: database environment variables are missing.'
          : 'The API is running but it cannot reach SQL Server.',
        details: {
          ...common,
          database: notConfigured ? 'not configured' : 'unreachable',
          connection: describeDatabase(),
          driver: error.message,
          missing: notConfigured ? error.missing : undefined,
          milliseconds: Date.now() - started,
        },
      },
    });
  }
}));

metaRouter.get('/semesters', requireAuth, route(async (req, res) => (
  ok(res, { rows: await query(SQL.B1_SEMESTERS) })
)));

metaRouter.get('/departments', requireAuth, route(async (req, res) => (
  ok(res, { rows: await query(SQL.A12_DEPARTMENTS) })
)));
