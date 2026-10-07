/**
 * The Vercel serverless entry point of the Zewail Desk API.
 *
 * Locally the API is a normal process: "npm start" runs src/app.js, which listens on PORT.
 * A deployment has no long-lived process, so this file is what Vercel runs instead. Vercel
 * builds it as one Node function, which is served at the path /api, and server/vercel.json
 * rewrites every request of the domain to it, so the Express application sees the addresses
 * it was written for (/api/meta/health, /api/auth/login, ...) and "/" as well.
 *
 * Three things this file must never do:
 *
 *   * open a listener. Vercel owns the HTTP server; app.listen() inside a function is a
 *     process that never answers and never ends.
 *   * let a throw escape. An uncaught error inside a function is answered with
 *     FUNCTION_INVOCATION_FAILED, which hides the real cause; every failure is turned into
 *     the one answer shape of the API, so the caller always sees { ok: false, error }.
 *   * create the application on every request. The Express application, and the pool of SQL
 *     Server connections inside it, are built once per function instance and reused.
 */
import { createApp } from '../src/app.js';

const app = createApp();

export default function zewailDeskApi(req, res) {
  try {
    app(req, res);
  } catch (error) {
    console.error('[vercel] the request could not be handled:', error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: 'server_error',
        message: 'The API could not finish the operation. The details are in the function log.',
      },
    }));
  }
}
