/**
 * The Express application of Zewail Desk.
 *
 * Two ways to run the project, both from this one file:
 *
 *   npm start            the API, and (when client/dist exists) the built client pages as
 *                        well, so the whole project is served on one port and the browser
 *                        never needs a second server and never needs CORS
 *   npm run dev          the API only; the Vite development server of client/ takes the
 *                        pages and proxies /api to this port
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
import { config, projectRoot, assertConfigForStartup } from './config.js';
import { attachUser } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './http/respond.js';
import { authRouter } from './routes/auth.js';
import { studentRouter } from './routes/student.js';
import { instructorRouter } from './routes/instructor.js';
import { adminRouter } from './routes/admin.js';
import { reportsRouter } from './routes/reports.js';
import { metaRouter } from './routes/meta.js';
import { closePool } from './db.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);          // the preview proxy of the sandbox sits in front

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

  // the client of the Vite development server is on another port, so it needs CORS; the
  // built client is served from here and needs nothing
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin === config.clientOrigin) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/api', attachUser);
  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/instructor', instructorRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);

  // the built client, when it exists (npm run build inside client/)
  const clientDist = path.join(projectRoot, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.json({
      ok: true,
      data: {
        name: 'Zewail Desk API',
        message: 'The client is not built yet. Run "npm run build" inside client/, or use the Vite development server.',
        endpoints: ['/api/meta/health', '/api/meta/summary', '/api/auth/login'],
      },
    }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export async function start() {
  const problems = assertConfigForStartup();
  if (problems.length) {
    console.warn('[config] ' + problems.join('; '));
  }
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Zewail Desk API listening on http://0.0.0.0:${config.port}`);
    console.log(`  environment : ${config.env}`);
    console.log(`  database    : ${config.db.server}:${config.db.port}/${config.db.database}`);
    console.log(`  client      : ${config.clientOrigin}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, closing the pool and the server.`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

// start only when this file is the entry point, so the tests can import createApp()
const isEntryPoint = process.argv[1] && process.argv[1].endsWith(path.join('src', 'app.js'));
if (isEntryPoint) {
  start().catch((error) => {
    console.error('The API could not start:', error);
    process.exit(1);
  });
}
