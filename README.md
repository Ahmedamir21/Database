# Zewail Desk

A self-service student information system for Zewail City - the CSAI 202 (Introduction to
Database Systems) project: analysis, design and implementation of a relational database, and a
web application that uses it.

The project is one application in two parts, plus the database it exists for:

```
database/    the delivered SQL Server database: schema, sample data, queries, reports, backup
server/      the Express API, the only part that talks to SQL Server
client/      the React interface the student, the teacher and the student office use
docs/        the deployment guide (and the folder for the written deliverables)
```

## The database

| File | What it is |
| --- | --- |
| `database/01_schema.sql` | 15 tables, 2 views, 4 stored procedures, 1 trigger, the grade functions |
| `database/02_seed.sql` | 1,700+ rows of sample data (three terms, 40 students, 8 teachers, 81 sections) |
| `database/03_queries.sql` | every query the application needs, with sample parameter values |
| `database/04_reports.sql` | 28 reports: statistical, detailed and managerial |
| `database/05_backup_restore.sql` | the backup, the verification and the restore of the project database |

The rules that must not be broken live **inside** the database: `sp_RegisterStudent` (seven
registration rules, one transaction, the locking hints that stop two students taking the last
seat), `sp_DropEnrollment`, `sp_PublishGrades`, `sp_CreateFirstAdmin`, and
`TR_Enrollment_SetGrade`, which writes the letter grade and the grade points the moment a score
is written. The API therefore never reads a table directly and never builds SQL text out of
what a user typed: it calls the procedures and binds parameters.

## Running it locally

```bash
# 1. the database
#    run database/01_schema.sql and database/02_seed.sql on a SQL Server

# 2. the API
cd server
cp .env.example .env        # then fill in DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
npm ci
npm run seed:admin          # the first administrator, once (ADMIN_EMAIL / ADMIN_PASSWORD)
npm start                   # http://localhost:4000  -> /api/meta/health

# 3. the client (a second terminal)
cd client
npm ci
npm run dev                 # http://localhost:5173, /api is proxied to the API
```

`npm run build` inside `client/` writes `client/dist`, and the API then serves the pages
itself: the whole project runs on one port.

Sample accounts of `database/02_seed.sql` (the sign in page offers them in the demonstration
mode): a student (`mina.ibrahim1@zewailcity.edu.eg`), a teacher
(`ahmed.hassan@zewailcity.edu.eg`) and the head of the student office
(`sara.ibrahim@zewailcity.edu.eg`), all with the sample password `Desk#2025`.

## Testing

```bash
cd server
npm ci
npm test              # 40 tests, no SQL Server needed
npm run check:deploy  # starts the file Vercel runs, in two deployment scenarios
```

Every push also runs the **deployed smoke test**: GitHub finds the Vercel deployment of that
commit, sends it real HTTP requests and publishes what each one answered as the check run
*deployed api probe* (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In one paragraph: the API is a Vercel project
with **Root Directory** `server`, framework **Other** (`server/vercel.json` sets
`"framework": null`, which is what keeps Vercel from auto-detecting a Node server preset and
failing), Node 24.x, and one serverless function (`server/api/index.js`) that every address of
the domain is rewritten to. Its database comes entirely from environment variables -
`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_CERT` and
`JWT_SECRET` - and when one of them is missing the health endpoint says so
(`503 database_not_configured`) instead of guessing a server. `CLIENT_ORIGIN` and
`COOKIE_SAMESITE` decide whether a separately deployed client may use the session cookie.
