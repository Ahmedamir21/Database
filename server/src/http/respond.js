/**
 * The shape of every answer of the API.
 *
 *   success: { "ok": true,  "data": ... }
 *   failure: { "ok": false, "error": { "code": "...", "message": "...", "details": ... } }
 *
 * One shape for everything means the client has one place that reads answers
 * (client/src/api.js) and one place that shows the message of an error.
 */
export function ok(res, data = null, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export function created(res, data = null) {
  return ok(res, data, 201);
}

/** wrap an async route so that a rejected promise reaches the error handler */
export function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'unknown_endpoint', message: `There is no endpoint ${req.method} ${req.originalUrl}.` },
  });
}

/* eslint-disable-next-line no-unused-vars -- express needs the 4 arguments to see this as an error handler */
export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const body = {
    ok: false,
    error: {
      code: error.code || 'server_error',
      message: status === 500 && !error.expose
        ? 'The server could not finish the operation. The details are in the server log.'
        : error.message,
    },
  };
  if (error.details) body.error.details = error.details;
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ->`, error);
  }
  res.status(status).json(body);
}
