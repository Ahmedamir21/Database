/**
 * The deployment behaviour of the API, tested without SQL Server and without Vercel.
 *
 * The settings of a deployment are read from the environment when the application is created,
 * so this file changes the environment FIRST and imports the application afterwards. It
 * describes the state of a deployment that the platform built, but that nobody has given a
 * database to yet - the state a marker sees when the credentials are the only missing piece.
 *
 * What is checked here:
 *   * the root of the domain answers with JSON (a function that throws would be reported by
 *     Vercel as FUNCTION_INVOCATION_FAILED, which hides every real problem)
 *   * a missing database is 503 database_not_configured, and the answer names the variables
 *   * a missing JWT_SECRET refuses to sign a session instead of signing one anybody can forge
 *   * only the browser addresses of the project are allowed to call the API with a cookie
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

// a local server/.env must not describe this deployment
process.env.DOTENV_CONFIG_PATH = path.join(os.tmpdir(), 'zewail-desk-no-dotenv');
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';                       // every Vercel deployment sets this
process.env.VERCEL_ENV = 'production';
process.env.VERCEL_URL = 'zewail-desk-abc123.vercel.app';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'zewail-desk.vercel.app';
process.env.VERCEL_GIT_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
process.env.VERCEL_GIT_COMMIT_REF = 'arena/22c722ca-database';
process.env.CLIENT_ORIGIN = 'https://zewail-desk.vercel.app';
delete process.env.JWT_SECRET;
delete process.env.DB_SERVER;
delete process.env.DB_NAME;
delete process.env.DB_USER;
delete process.env.DB_PASSWORD;

const { createApp } = await import('../src/app.js');

let server;
let base;

test.before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, url, { body, origin } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(origin ? { origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    cors: response.headers.get('access-control-allow-origin'),
    body: await response.json(),
  };
}

test('the address Vercel rewrites every request to answers with the index of the API', async () => {
  const { status, body } = await call('GET', '/api');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.name, 'Zewail Desk API');
  assert.equal(body.data.database, 'not configured', 'a deployment never guesses a server');
  assert.ok(body.data.warnings.some((line) => line.includes('DB_SERVER')));
});

test('the API says which revision it is running, so a stale deployment is visible', async () => {
  const index = await call('GET', '/api');
  assert.deepEqual(index.body.data.deployment, {
    commit: '0123456',
    ref: 'arena/22c722ca-database',
    environment: 'production',
    url: 'zewail-desk-abc123.vercel.app',
    productionUrl: 'zewail-desk.vercel.app',
  });
  const health = await call('GET', '/api/meta/health');
  assert.equal(health.body.error.details.deployment.commit, '0123456');
});

test('the root of the domain never crashes, whatever it serves', async () => {
  // A deployment of server/ carries no client/dist, so "/" is the index of the API there.
  // In a working tree where the client WAS built, "/" is the page of the application -
  // served by this same process - and that is correct too. Neither may ever be a 500.
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.name, 'Zewail Desk API');
  } else {
    assert.match(await response.text(), /<div id="root"/);
  }
});

test('the health endpoint names the environment variables that are missing', async () => {
  const { status, body } = await call('GET', '/api/meta/health');
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'database_not_configured');
  assert.deepEqual(body.error.details.missing, ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);
  assert.equal(body.error.details.connection, null);
  assert.ok(body.error.details.warnings.some((line) => line.includes('JWT_SECRET')));
});

test('a page that reads the database is refused with 503, not with a 500', async () => {
  const { status, body } = await call('GET', '/api/meta/summary');
  assert.equal(status, 503);
  assert.equal(body.error.code, 'database_not_configured');
});

test('signing in is refused while JWT_SECRET is not set', async () => {
  const { status, body } = await call('POST', '/api/auth/login', {
    body: { email: 'mina.ibrahim1@zewailcity.edu.eg', password: 'Desk#2025' },
  });
  assert.equal(status, 503);
  assert.equal(body.error.code, 'misconfigured_jwt_secret');
  assert.match(body.error.message, /JWT_SECRET/);
});

test('only the addresses of the project may call the API from a browser', async () => {
  const allowed = await call('GET', '/api/meta/health', { origin: 'https://zewail-desk.vercel.app' });
  assert.equal(allowed.cors, 'https://zewail-desk.vercel.app');
  const foreign = await call('GET', '/api/meta/health', { origin: 'https://elsewhere.example' });
  assert.equal(foreign.cors, null, 'a wildcard would let another site use the cookie');
});

test('the pages of an account still need a session', async () => {
  for (const url of ['/api/admin/users', '/api/student/overview', '/api/instructor/sections']) {
    const { status, body } = await call('GET', url);
    assert.equal(status, 401, url);
    assert.equal(body.error.code, 'not_signed_in');
  }
});
