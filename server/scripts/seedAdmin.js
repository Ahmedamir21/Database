#!/usr/bin/env node
/**
 * Create the FIRST administrator.
 *
 * This is the one account of the whole project that is not created from inside the
 * application, and that is exactly what the requirements ask for: "only the first admin is
 * created manually, further admins are created by an admin through the application".
 * The account is written by sp_CreateFirstAdmin, which refuses to work when an
 * administrator already exists.
 *
 * Usage (the values come from server/.env, or from the command line):
 *
 *   npm run seed:admin
 *   npm run seed:admin -- --email=admin@zewailcity.edu.eg --password='Desk#2025' --name='Sara Ibrahim'
 *
 * The password is hashed with bcrypt here, in the script: the plain text never reaches the
 * database and is never written to a log.
 */
import { config } from '../src/config.js';
import { createFirstAdmin } from '../src/services/adminService.js';
import { describeDatabase } from '../src/config.js';
import { closePool } from '../src/db.js';

function fromArguments(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const fullName = fromArguments('name') || config.firstAdmin.fullName;
  const email = fromArguments('email') || config.firstAdmin.email;
  const password = fromArguments('password') || config.firstAdmin.password;

  console.log('Zewail Desk - first administrator');
  console.log(`  database : ${describeDatabase()}`);

  if (!email || !password) {
    console.error('\nNothing was created: ADMIN_EMAIL and ADMIN_PASSWORD are not set.');
    console.error('Put them in server/.env (see .env.example) or pass --email= and --password=.');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await createFirstAdmin({ fullName, email, password });
    console.log(`\nThe first administrator was created (UserId ${result.userId}, ${result.email}).`);
    console.log('Sign in with that e-mail address and the password you set, then create the');
    console.log('other administrators from the "Users" page inside the application.');
  } catch (error) {
    if (error?.code === 'admin_exists' || error?.number === 51040) {
      console.log('\nAn administrator already exists, so nothing was created.');
      console.log('Create the next one from the "Users" page inside the application.');
      return;
    }
    console.error('\nThe administrator could not be created:', error.message);
    if (error?.details) console.error(error.details);
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await closePool();
}
