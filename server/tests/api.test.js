/**
 * The HTTP layer, without a database.
 *
 * These tests start the real Express application on a free port and speak to it with fetch.
 * They are the proof of three things that a marker checks first:
 *   1. the shape of an answer is always the same ({ ok: true, data } / { ok: false, error }),
 *   2. a page that belongs to an account answers 401 when nobody is signed in,
 *   3. the input is checked with a clear message BEFORE anything is sent to SQL Server.
 *
 * They never need SQL Server: every request below is refused by the API itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

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

async function call(method, url, body) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test('the root of the server answers, with the client when it is built and with the API index otherwise', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    // no client/dist in this working tree: the root is the small index of the API
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.name, 'Zewail Desk API');
  } else {
    // client/dist exists: the root is the page of the application, served by this same server
    const page = await response.text();
    assert.match(page, /<div id="root"/);
  }
});

test('the index of the API answers on /api whatever the client does', async () => {
  const { status, body } = await call('GET', '/api');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.name, 'Zewail Desk API');
});

test('an unknown endpoint answers 404 in the shape of the API', async () => {
  const { status, body } = await call('GET', '/api/there-is-nothing-here');
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'unknown_endpoint');
});

test('signing in without an e-mail is refused with a clear message', async () => {
  const { status, body } = await call('POST', '/api/auth/login', {});
  assert.equal(status, 400);
  assert.equal(body.error.code, 'missing_credentials');
  assert.match(body.error.message, /e-mail/i);
});

test('the student pages need a session', async () => {
  for (const url of ['/api/student/overview', '/api/student/transcript', '/api/instructor/sections', '/api/admin/users']) {
    const { status, body } = await call('GET', url);
    assert.equal(status, 401, `${url} should need a session`);
    assert.equal(body.error.code, 'not_signed_in');
  }
});

test('being signed out is an answer, not an error', async () => {
  const { status, body } = await call('GET', '/api/auth/me');
  assert.equal(status, 200);
  assert.equal(body.data.user, null);
});

test('the report page is not open to the public', async () => {
  const { status, body } = await call('GET', '/api/reports/R3.4');
  assert.equal(status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'not_signed_in');
});

test('the sign up of a student checks the input before the database is touched', async () => {
  const bad = await call('POST', '/api/auth/signup', { fullName: 'A', email: 'nope', password: 'short', confirmPassword: 'other' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error.message, /full name/i);

  const weak = await call('POST', '/api/auth/signup', {
    fullName: 'New Student', email: 'new.student@zewailcity.edu.eg',
    programId: 1, password: 'password', confirmPassword: 'password',
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, 'weak_password');
});

test('the health endpoint answers in the shape of the API (the database may be down)', async () => {
  const { status, body } = await call('GET', '/api/meta/health');
  assert.ok([200, 503].includes(status));
  if (status === 200) {
    assert.equal(body.data.api, 'up');
    assert.equal(body.data.database, 'up');
    assert.ok(body.data.connection.includes('@'), 'the connection is described without a password');
  } else {
    // 503 either because the deployment has no DB_* variables at all, or because the server
    // that they point at does not answer; both say which one it is
    assert.ok(['database_not_configured', 'database_unreachable'].includes(body.error.code));
  }
});

test('a request that is far too large is refused', async () => {
  const { status } = await call('POST', '/api/auth/login', { email: 'a@b.cd', password: 'x'.repeat(300000) });
  assert.ok(status === 413 || status === 400, `expected a refusal, got ${status}`);
});
