/**
 * The Express application of Zewail Desk.
 *
 * Three ways to run the project, all from this one file:
 *
 *   npm start            the API, and (when client/dist exists) the built client pages as
 *                        well, so the whole project is served on one port and the browser
 *                        never needs a second server and never needs CORS
 *   npm run dev          the API only; the Vite development server of client/ takes the
 *                        pages and proxies /api to this port
 *   api/index.js         the same application as a serverless function, which is how Vercel
 *                        runs it (see docs/DEPLOYMENT.md)
 *
 * The order of the middleware is the order of the checks: security headers, the log line,
 * the body parser, the cookie, "who is calling", the routes, and at the end the two handlers
 * that turn anything left over into the one answer shape of the API.
 */
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import {
  config, projectRoot, configWarnings, describeDatabase, jwtSecretProblem, allowedOrigins,
} from './config.js';
import { ApiError } from './http/errors.js';
import { attachUser } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './http/respond.js';
import { authRouter } from './routes/auth.js';
import { studentRouter } from './routes/student.js';
import { instructorRouter } from './routes/instructor.js';
import { adminRouter } from './routes/admin.js';
import { reportsRouter } from './routes/reports.js';
import { metaRouter } from './routes/meta.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);          // Vercel (and the development proxies) sit in front

  // a few headers by hand, so the project has no dependency that only exists for this
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  if (config.env !== 'test') {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        if (req.path.startsWith('/api')) {
          console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started} ms)`);
        }
      });
      next();
    });
  }

  /**
   * CORS: the pages of the client may call this API from the addresses in CLIENT_ORIGIN (a
   * comma separated list) and from the deployment's own addresses - never from anywhere.
   * A wildcard is impossible here because the session is a cookie (credentials: true).
   */
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/api', attachUser);

  /**
   * Signing in on a deployment that has no usable JWT_SECRET is refused before anything else
   * happens: instead of a session that anybody could forge, the caller gets a clear 503.
   * Local development, and the tests, are not affected (the variable only has to be real
   * when the API runs as a deployment).
   */
  app.use('/api/auth', (req, res, next) => {
    if (config.isProduction && jwtSecretProblem()) {
      return next(new ApiError(
        503,
        'misconfigured_jwt_secret',
        `${jwtSecretProblem()}. Sign in is refused until JWT_SECRET is set in the environment of the deployment.`,
      ));
    }
    return next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/instructor', instructorRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);

  // the built client, when it exists (npm run build inside client/)
  const clientDist = path.join(projectRoot, 'client', 'dist');
  const clientIndex = path.join(clientDist, 'index.html');
  const hasClient = fs.existsSync(clientIndex);
  if (hasClient) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(clientIndex));
  }

  /**
   * The index of the API. It answers on "/" and on "/api", which is what a deployment needs:
   * a serverless function that receives every request must never answer an unhandled path
   * with a crash, and the root of the domain is the first address anybody opens.
   */
  app.get(['/', '/api'], (req, res) => res.json({
    ok: true,
    data: {
      name: 'Zewail Desk API',
      environment: config.env,
      platform: config.platform,
      database: describeDatabase() || 'not configured',
      client: hasClient ? 'the built client is served by this server' : 'client/ (Vite) or a separate deployment',
      endpoints: ['/api/meta/health', '/api/meta/summary', '/api/auth/login'],
      documentation: 'docs/DEPLOYMENT.md',
      warnings: configWarnings(),
    },
  }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export async function start() {
  const problems = configWarnings();
  if (problems.length) {
    console.warn('[config] ' + problems.join(';\n[config] '));
  }
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Zewail Desk API listening on http://0.0.0.0:${config.port}`);
    console.log(`  environment : ${config.env}`);
    console.log(`  database    : ${describeDatabase() || 'not configured (DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD)'}`);
    console.log(`  client      : ${allowedOrigins.join(', ') || 'none'}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, closing the pool and the server.`);
    server.close(async () => {
      const { closePool } = await import('./db.js');
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

/**
 * Start only when this file is the entry point, so that the tests, the deployment check and
 * the Vercel function can all import createApp() without anybody opening a second listener.
 * Vercel runs its own HTTP server and calls the export of api/index.js, so inside a
 * deployment this block is never reached.
 */
const isEntryPoint = Boolean(process.argv[1])
  && process.argv[1].endsWith(path.join('src', 'app.js'))
  && !process.env.VERCEL;

if (isEntryPoint) {
  start().catch((error) => {
    console.error('The API could not start:', error);
    process.exit(1);
  });
}
