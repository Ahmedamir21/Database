# Deploying Zewail Desk

Two deployments, both from the same commit of this repository:

| What | Directory | Vercel project | Answers on |
| --- | --- | --- | --- |
| The **API** (Express + SQL Server) | `server/` | `database` | `/`, `/api/meta/health`, `/api/auth/login`, … |
| The **client** (React + Vite) - optional | `client/` | any name | the pages of the application |

The API is the deployment that matters: it is the only part that talks to the database, and it
is the one whose `/api/meta/health` says whether the whole project works. The client can be
served by the API itself (one deployment, no CORS, the simplest setup) or by its own project.

Everything below is configuration that lives in this repository. Nothing in it is a
credential: every secret is an environment variable of the Vercel project.

---

## 1. The API project

### 1.1 Settings of the project

| Setting | Value | Where it is written down |
| --- | --- | --- |
| Git repository | `Ahmedamir21/Database` | project settings |
| Production branch | the branch that is deployed (`arena/22c722ca-database` while it is under review, `main` after the merge) | project settings |
| **Root Directory** | `server` | project settings |
| Framework Preset | **Other** | `server/vercel.json` sets `"framework": null`, which is the same thing |
| Build Command | empty / off | nothing to build: the API is source code that Vercel compiles |
| Install Command | `npm ci` | `server/vercel.json` |
| Output Directory | leave as Vercel finds it | `server/public/` exists on purpose (see 1.4) |
| Node.js Version | **24.x** | `server/package.json` → `"engines": { "node": "24.x" }` |

> **Why `"framework": null` matters.** Vercel sees `express` in the dependencies and, without
> that line, auto-detects a Node *server* preset, then goes looking for a server entry point in
> the build output - which does not exist for this project, so the deployment fails or the
> routing ends up surprising (a root request that never reaches Express). Declaring
> `"framework": null` turns the detection off and Vercel does exactly two things: it builds
> `api/**` as Serverless Functions and it serves `public/` statically.

### 1.2 The function and the rewrites

```
server/
  api/index.js      the function Vercel builds; served at the path /api
  src/**            the Express application, the services, the SQL statements
  vercel.json       framework: null, install: npm ci, every request -> /api
  public/           the static output root (it holds no page, on purpose)
```

`server/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "framework": null,
  "installCommand": "npm ci",
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}
```

The rewrite sends **every** address of the domain to the one function, and a rewrite selects
the function without changing the address the function reads: Express keeps seeing
`/api/meta/health`, `/api/auth/login`, `/` - the addresses it was written for. There is
therefore no `/api/api/...` anywhere, and `/` answers with the small JSON index of the API
(`server/src/app.js`) unless the working tree also contains a built client, in which case the
API serves those pages instead.

`api/index.js` never calls `app.listen()`: Vercel owns the HTTP server, and a listener inside a
function is a process that never answers and never ends. The Express application (and the pool
of SQL Server connections inside it) is created once per function instance, and an unexpected
error is turned into `{ ok: false, error: { ... } }` instead of being left to Vercel, which
would answer `FUNCTION_INVOCATION_FAILED` and hide the real cause.

### 1.3 Environment variables of the API project

Add these in *Project → Settings → Environment Variables*, for the **Production** environment
(and for *Preview* too if preview deployments should work). Values are the ones of your SQL
Server; nothing here is stored in the repository.

| Variable | Required | What it is |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `DB_SERVER` | **yes** | host name of SQL Server, reachable from the internet |
| `DB_PORT` | no (1433) | the TCP port |
| `DB_NAME` | **yes** | `ZewailDesk` |
| `DB_USER` | **yes** | the SQL login (SQL authentication; Windows authentication cannot work from Vercel) |
| `DB_PASSWORD` | **yes** | the password of that login |
| `DB_ENCRYPT` | yes for a deployment | `true` for any server that is not on your own machine |
| `DB_TRUST_CERT` | yes for a deployment | `false` when the server has a real certificate (Azure SQL, a proper SQL Server away from home); `true` only for a self-signed one |
| `DB_POOL_MAX` | no (10) | connections per function instance |
| `DB_CONNECTION_TIMEOUT` | no (15000) | milliseconds to wait for a connection |
| `DB_REQUEST_TIMEOUT` | no (20000) | milliseconds to wait for an answer |
| `DB_KEEP_ALIVE_SECONDS` | no (0 = off) | see 1.5 |
| `JWT_SECRET` | **yes** | 32+ random characters; `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_MINUTES` | no (480) | how long a session lasts |
| `COOKIE_NAME` | no (`zewaildesk_session`) | the name of the session cookie |
| `COOKIE_SAMESITE` | no (`lax`) | `lax` when the pages and the API are one deployment; `none` when the client has its own domain |
| `COOKIE_DOMAIN` | no | only to share the cookie between sub-domains of one domain |
| `BCRYPT_ROUNDS` | no (10) | cost of the password hash |
| `CLIENT_ORIGIN` | when the client is separate | every browser address that may call the API with a cookie, comma separated (`https://your-client.vercel.app`). The deployment's own addresses are always allowed |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_POSITION` | only for `npm run seed:admin` | the first administrator, created once, by hand |

Nothing is guessed when one of the four `DB_*` variables above is missing: the API answers
`503 database_not_configured` and **names the variables** instead of trying `sa@localhost`.
In production a missing or example `JWT_SECRET` refuses every sign in with
`503 misconfigured_jwt_secret` instead of signing sessions that anybody could forge.

### 1.4 Why `server/public/` exists

Vercel's *Other* preset serves a `public/` directory when there is one, and the **project root
directory itself** when there is not - which would let anybody download `src/`, `api/` and
`package.json` from the deployed domain. Keeping `public/` (with a single text file) is
therefore deliberate: the static output is that directory and nothing else, so a request that
is not a file in it reaches the rewrite and the Express application.

### 1.5 Connection pooling on a serverless platform

The pool is created on the first query of a function instance and handed out to every request
that instance serves afterwards (one connect at a time, so two requests arriving together wait
for the same connection). A connection that dies in the background clears the pool and the next
request opens a fresh one, and an `error` listener on the pool keeps that from becoming an
uncaught exception.

Vercel suspends an instance that gets no traffic, and the pool is frozen with it. The next
request then pays for a new connect - correct, just slower. `DB_KEEP_ALIVE_SECONDS` (for
instance `30`) keeps the pool warm by asking the database for the time every interval; it costs
one function call per interval, so it is off by default.

---

## 2. Deploying

### 2.1 From the Vercel dashboard

1. **Add New → Project → Import** `Ahmedamir21/Database`.
2. Set **Root Directory** to `server`, **Framework Preset** to `Other`, **Node.js Version** to
   `24.x`, and *Build Command* / *Output Directory* overrides off.
3. Add the environment variables of 1.3 (Production, and Preview if wanted).
4. Deploy, then check the branch: the deployment must be built from the branch you intend
   (`arena/22c722ca-database` while it is under review). *Settings → Git → Production Branch*
   decides which branch the production domain follows.

**Every push is a Preview deployment.** A push to a branch that is not the Production Branch
builds and runs, but only the production domain follows the production branch. To put the
current commit on the production domain, either set *Settings → Git → Production Branch* to
`arena/22c722ca-database` for the review and back to `main` after the merge, or promote this
one deployment by hand: *Deployments → the deployment → ⋯ → Promote to Production*.

Whoever probes the result does not have to be a person with a browser: every push runs the
**deployed smoke test** (`.github/workflows/deployed-smoke-test.yml`), which finds the
deployment of the commit, sends it the requests of section 3, and publishes the answers as the
check run *deployed api probe* on the commit.

### 2.2 From a machine with the Vercel CLI

```bash
npm i -g vercel
git checkout arena/22c722ca-database

cd server
vercel link                 # choose the existing project "database", or create it
vercel env add DB_SERVER production     # ... and every other variable of 1.3
vercel env add DB_NAME production
vercel env add DB_USER production
vercel env add DB_PASSWORD production
vercel env add DB_ENCRYPT production
vercel env add DB_TRUST_CERT production
vercel env add JWT_SECRET production
vercel env add NODE_ENV production
vercel --prod               # deploys what is in server/ right now
```

`vercel --prod` deploys the working tree, which is why the last line of a deployment should be
`vercel --prod` **after** `git status` is clean: the deployed revision and the branch have to be
the same one.

### 2.3 The database itself

The SQL Server has to be reachable from the internet (Vercel functions run in the cloud, not on
your machine) and it has to allow SQL authentication:

```sql
-- in SQL Server Management Studio or sqlcmd, in this order:
database/01_schema.sql        -- tables, views, procedures, the trigger, the grade functions
database/02_seed.sql          -- the sample data (1,700+ rows: students, sections, money, ...)
database/03_queries.sql       -- every query the application uses, with sample parameters
database/04_reports.sql       -- the 28 reports, in three categories
database/05_backup_restore.sql-- the backup and restore script of the deliverables
```

Then create the first administrator **once**, from a machine that can reach the database:

```bash
cd server
ADMIN_EMAIL=you@zewailcity.edu.eg ADMIN_PASSWORD='...' npm run seed:admin
```

From that moment the administrator of the application creates the other administrators
(*Office → Users*). A firewall rule for the Vercel egress addresses (or, for Azure SQL,
"Allow Azure services and resources to access this server") and TCP 1433 are what a deployment
usually still needs.

---

## 3. Verifying a deployment

```bash
curl -sS https://<your-project>.vercel.app/api/meta/health | python3 -m json.tool
```

| Answer | Meaning | What to do |
| --- | --- | --- |
| `200` `{"api":"up","database":"up","connection":"…","milliseconds":…}` | the API runs and SQL Server answered | nothing; open the client |
| `503` `{"error":{"code":"database_not_configured","details":{"missing":[…]}}}` | the deployment has no database variables | add them (1.3); `details.missing` names them |
| `503` `{"error":{"code":"database_unreachable","details":{"driver":"…"}}}` | the variables are there, the server did not answer | firewall, host name, port, `DB_ENCRYPT`/`DB_TRUST_CERT`, or the database is not running |
| `503` `{"error":{"code":"misconfigured_jwt_secret"}}` on sign in | `JWT_SECRET` is missing, short or still the example | set a 32+ character random value |
| `500` `FUNCTION_INVOCATION_FAILED` (plain text, not JSON) | the function threw before the API could answer | `npx vercel logs <deployment-url>` or the dashboard: *Deployments → Functions → Logs* |

### Which revision is answering

Every answer of the API carries the facts of the deployment it came from, so a URL can be asked
which commit it runs - no dashboard needed:

```bash
curl -sS https://<your-project>.vercel.app/api/meta/health | python3 -m json.tool
```

```json
{
  "api": "up", "database": "up", "environment": "production", "platform": "vercel",
  "deployment": {
    "commit": "9748c99", "ref": "arena/22c722ca-database", "environment": "production",
    "url": "database-abc123.vercel.app", "productionUrl": "database-ahmedamir21.vercel.app"
  }
}
```

`deployment.commit` is the revision that answered, `deployment.productionUrl` is the domain the
project calls its production one. The push-time probe (`.github/workflows/deployed-smoke-test.yml`)
checks both: it fails when the deployment does not run the commit that was pushed, and it reports
where the production domain stands - which is how a production that is still on an older commit
becomes visible instead of being assumed.

Local check, without SQL Server and without Vercel:

```bash
cd server
npm ci
npm test              # 40 tests: the HTTP layer, the grading rules, the SQL statements, the report registry
npm run check:deploy  # runs api/index.js (the file Vercel runs) in two deployment scenarios
```

`npm run check:deploy` starts the real entry point in a plain Node HTTP server - the way a
serverless platform calls it - once with no database variables and once pointing at an address
that cannot answer, and prints what each of the public endpoints answered. It is the closest
thing to a deployment that can be done without a deployment.

---

## 4. The client project (optional)

One deployment is enough: `npm run build` inside `client/` writes `client/dist`, and the API
serves those pages itself (no CORS, no cookie questions). Use a second project only if the
pages should live on their own domain:

1. New Vercel project from the same repository, **Root Directory** `client`, framework **Vite**.
2. Build-time variables: `VITE_API_MODE=real` and
   `VITE_API_BASE_URL=https://<your-api-project>.vercel.app`.
3. In the **API** project, add the client's address to `CLIENT_ORIGIN` and set
   `COOKIE_SAMESITE=none` (the session cookie is `Secure`, which browsers demand together with
   `None`). Without `none`, the sign in succeeds and the next page looks signed out.

If the client is deployed, tell the deployment probe where it is: *Settings → Secrets and
variables → Actions → Variables → New repository variable*, name `CLIENT_URL`, value the client
address. The probe then checks that the client page is served as well.

`VITE_API_MODE=mock` builds the client against the sample data inside the browser
(`client/src/mock/`), which needs no API and no database at all: useful for a demonstration or
a screenshot, and it says so on the sign in page.

---

## 5. What cannot be done from the sandbox this was prepared in

* No Vercel access: the deployment itself has to be triggered by you (dashboard, the CLI of
  2.2, or by pushing to the production branch). The repository is ready for it.
* No SQL Server and no `sqlcmd`: the `.sql` files of `database/` are checked by a parser and by
  review, not by a server. The first run of `01_schema.sql` on the real server is the first
  real execution - read the `PRINT` lines of `02_seed.sql` when it finishes.
