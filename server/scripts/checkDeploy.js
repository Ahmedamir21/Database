#!/usr/bin/env node
/**
 * Zewail Desk - the deployment check.
 *
 *     npm run check:deploy
 *
 * Two questions, answered without SQL Server and without Vercel:
 *
 *   A. When the code is deployed but the environment variables of the database are not set
 *      yet, does the API answer clearly instead of crashing or guessing "sa@localhost"? And
 *      does it refuse to sign a session with a missing JWT_SECRET?
 *   B. When the variables are set but the server they name does not answer, does the health
 *      endpoint say database_unreachable - and is the configuration really the one that was
 *      handed to the process?
 *
 * To be honest about both, the script runs the file Vercel runs (api/index.js) inside an
 * ordinary Node HTTP server, exactly the way a serverless platform calls it, in two child
 * processes with two different environments. Scenario B points the driver at 198.51.100.9,
 * an address reserved for documentation (TEST-NET-2) that is not routable, so no real
 * database is ever contacted; it is the answer of the API that is being checked. Nothing in
 * here is a credential of the project: no value below is used anywhere but in these probes.
 */
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

/** the environment every scenario starts from: production, on Vercel, with a real client */
function productionEnv(extra) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME || '/tmp',
    // a local server/.env must never leak into this check
    DOTENV_CONFIG_PATH: '/tmp/zewail-desk-no-dotenv',
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_URL: 'zewail-desk-git-check.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'zewail-desk.vercel.app',
    CLIENT_ORIGIN: 'https://zewail-desk.vercel.app',
    ...extra,
  };
}

const MISSING_DATABASE_ENV = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

const SCENARIOS = {
  a: {
    title: 'A. the deployment has no database variables yet',
    env: productionEnv({}),
    checks: [
      {
        method: 'GET', path: '/api', status: 200,
        assert: (body) => body.data.name === 'Zewail Desk API' && body.data.database === 'not configured',
        note: (body) => `${body.data.name}, database "${body.data.database}" (the address Vercel rewrites every request to)`,
      },
      {
        // a deployment of server/ never carries client/dist, so "/" is the index of the API.
        // In a working tree where the client IS built, "/" is the page of the application
        // instead - which is also correct, and this is what says which one answered.
        method: 'GET', path: '/', status: 200,
        assert: (body, context) => (context.json
          ? body.data.name === 'Zewail Desk API'
          : /<div id="root"/.test(context.text)),
        note: (body, context) => (context.json
          ? 'the index of the API (this working tree has no client/dist)'
          : 'the built client page (this working tree has a client/dist)'),
      },
      {
        method: 'GET', path: '/api/meta/health', status: 503, code: 'database_not_configured',
        assert: (body) => (body.error.details.missing || []).join(',') === MISSING_DATABASE_ENV.join(','),
        note: (body) => `missing ${body.error.details.missing.join(', ')}`,
      },
      {
        method: 'GET', path: '/api/meta/summary', status: 503, code: 'database_not_configured',
        note: () => 'a page that reads the database is refused with 503, never with a 500 crash',
      },
      {
        method: 'POST', path: '/api/auth/login', status: 503, code: 'misconfigured_jwt_secret',
        body: { email: 'mina.ibrahim1@zewailcity.edu.eg', password: 'not-a-real-password' },
        note: () => 'signing in is refused while JWT_SECRET is not set',
      },
      {
        method: 'GET', path: '/api/admin/users', status: 401, code: 'not_signed_in',
        note: () => 'a page of the office still belongs to the office',
      },
      {
        method: 'GET', path: '/api/there-is-nothing-here', status: 404, code: 'unknown_endpoint',
        note: () => 'an unknown address is an answer, not a crash',
      },
      {
        method: 'GET', path: '/api/meta/health', status: 503, origin: 'https://zewail-desk.vercel.app',
        cors: 'https://zewail-desk.vercel.app', note: () => 'the client of the project may call it',
      },
      {
        method: 'GET', path: '/api/meta/health', status: 503, origin: 'https://elsewhere.example',
        cors: null, note: () => 'another website gets no CORS header at all',
      },
    ],
  },
  b: {
    title: 'B. the database variables are set, the server does not answer',
    env: productionEnv({
      DB_SERVER: '198.51.100.9',
      DB_PORT: '1433',
      DB_NAME: 'ZewailDesk',
      DB_USER: 'sa',
      DB_PASSWORD: 'probe-only-not-a-credential',
      DB_CONNECTION_TIMEOUT: '2000',
      DB_REQUEST_TIMEOUT: '2000',
      DB_ENCRYPT: 'true',
      DB_TRUST_CERT: 'false',
      JWT_SECRET: 'deployment-check-secret-0123456789abcdefghijklmnop',
    }),
    checks: [
      {
        method: 'GET', path: '/api/meta/health', status: 503, code: 'database_unreachable',
        assert: (body) => body.error.details.connection === 'sa@198.51.100.9:1433/ZewailDesk'
          && typeof body.error.details.driver === 'string' && body.error.details.driver.length > 0
          && !body.error.details.warnings.some((line) => line.includes('JWT_SECRET')),
        note: (body) => `connection ${body.error.details.connection}, driver said: ${firstLine(body.error.details.driver)}`,
      },
      {
        method: 'GET', path: '/api', status: 200,
        assert: (body) => body.data.database === 'sa@198.51.100.9:1433/ZewailDesk'
          && Array.isArray(body.data.warnings) && body.data.warnings.length === 0,
        note: (body) => `the configuration is read: ${body.data.database}`,
      },
      {
        method: 'POST', path: '/api/auth/login', status: 400, code: 'missing_credentials',
        body: {},
        note: () => 'with a real JWT_SECRET the guard is quiet and the input is checked as usual',
      },
    ],
  },
};

function firstLine(text) {
  return String(text).split('\n')[0].slice(0, 110);
}

/* ------------------------------------------------------------------ the child: the checks */

async function runScenario(name) {
  const scenario = SCENARIOS[name];
  const { default: handler } = await import('../api/index.js');
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  console.log(`\n=== ${scenario.title} ===`);
  const failures = [];
  for (const check of scenario.checks) {
    const headers = {};
    if (check.body !== undefined) headers['content-type'] = 'application/json';
    if (check.origin) headers.origin = check.origin;
    let status = 0;
    let body = {};
    let cors;
    let context = {};
    try {
      const response = await fetch(`${base}${check.path}`, {
        method: check.method,
        headers,
        body: check.body === undefined ? undefined : JSON.stringify(check.body),
      });
      status = response.status;
      cors = response.headers.get('access-control-allow-origin');
      const contentType = response.headers.get('content-type') || '';
      context = { json: contentType.includes('application/json'), contentType, text: '' };
      if (context.json) body = await response.json();
      else context.text = await response.text();
    } catch (error) {
      failures.push(`${check.method} ${check.path}: the request itself failed (${error.message})`);
      console.log(`FAIL ${check.method} ${check.path} -> the request failed: ${error.message}`);
      continue;
    }

    const problems = [];
    if (status !== check.status) problems.push(`expected ${check.status}, got ${status}`);
    if (check.code && body?.error?.code !== check.code) {
      problems.push(`expected code ${check.code}, got ${body?.error?.code || JSON.stringify(body).slice(0, 80)}`);
    }
    if (check.cors !== undefined && (cors || null) !== check.cors) {
      problems.push(`expected access-control-allow-origin ${check.cors === null ? '(none)' : check.cors}, got ${cors}`);
    }
    if (check.assert && !check.assert(body, context)) problems.push('the answer is not the one that was promised');

    const summary = check.note ? ` - ${check.note(body, context)}` : '';
    if (problems.length) {
      failures.push(`${check.method} ${check.path}: ${problems.join('; ')}`);
      console.log(`FAIL ${check.method.padEnd(4)} ${check.path} -> ${status}${summary}`);
      for (const problem of problems) console.log(`     ${problem}`);
    } else {
      console.log(`ok   ${check.method.padEnd(4)} ${check.path} -> ${status}${summary}`);
    }
  }

  await new Promise((resolve) => server.close(resolve));
  console.log(failures.length
    ? `\n${failures.length} check(s) of scenario ${name.toUpperCase()} did not answer as documented.`
    : `\nscenario ${name.toUpperCase()}: every answer is the documented one.`);
  return failures.length;
}

/* ------------------------------------------------------------------- the parent: two runs */

function runAsChild(name) {
  const result = spawnSync(process.execPath, [SELF, `--scenario=${name}`], {
    env: SCENARIOS[name].env,
    stdio: 'inherit',
    cwd: new URL('..', import.meta.url).pathname,
  });
  return result.status === 0;
}

async function main() {
  const asked = process.argv.find((argument) => argument.startsWith('--scenario='));
  if (asked) {
    const failures = await runScenario(asked.slice('--scenario='.length));
    process.exit(failures ? 1 : 0);
  }

  console.log('Zewail Desk - the deployment check');
  console.log('the file Vercel runs (api/index.js) inside a plain Node HTTP server, twice');
  const results = Object.keys(SCENARIOS).map((name) => runAsChild(name));
  const failed = results.filter((ok) => !ok).length;
  console.log(failed
    ? `\n${failed} of ${results.length} scenario(s) failed.`
    : `\nBoth scenarios answered exactly as docs/DEPLOYMENT.md describes.`);
  process.exit(failed ? 1 : 0);
}

main();
