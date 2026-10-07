/**
 * Small routes that any signed in user needs: the semesters to choose from, the size of the
 * sample data, and a health check that tells whether the API can reach SQL Server.
 *
 * The health check is also what makes the demonstration easy: the first thing the marker
 * sees on the sign in page is whether the database is reachable.
 */
import { Router } from 'express';
import * as SQL from '../sql/statements.js';
import { query, queryOne } from '../db.js';
import { ok, route } from '../http/respond.js';
import { requireAuth } from '../middleware/auth.js';
import { describeDatabase, config } from '../config.js';
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
  try {
    await queryOne(SQL.S3_PUBLIC_SUMMARY);
    return ok(res, {
      api: 'up',
      database: 'up',
      connection: describeDatabase(),
      environment: config.env,
      milliseconds: Date.now() - started,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: {
        code: 'database_unreachable',
        message: 'The API is running but it cannot reach SQL Server.',
        details: { connection: describeDatabase(), driver: error.message },
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
