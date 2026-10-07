/**
 * The rules of the SQL layer of the server.
 *
 * These tests look at the text of the statements and at the way the code uses them, because
 * the two things that usually go wrong in a project like this are: a statement that is built
 * by joining strings (the door to SQL injection), and a statement that nobody calls any more
 * (a query that the report claims exists but that the application never runs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as SQL from '../src/sql/statements.js';
import { projectRoot } from '../src/config.js';

const SOURCE_FILES = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.js')) SOURCE_FILES.push(full);
  }
}
collect(path.join(projectRoot, 'server', 'src'));
const SOURCE_TEXT = SOURCE_FILES.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

test('the statement file exports a named statement for every query', () => {
  const names = Object.keys(SQL);
  assert.ok(names.length >= 60, `expected at least 60 statements, found ${names.length}`);
  for (const name of names) {
    assert.match(name, /^([A-Z]\d+[A-Z]?|[A-Z]+\d*)_[A-Z0-9_]+$/, `${name} has to carry the number of 03_queries.sql`);
  }
});

test('every statement is a single statement and is not empty', () => {
  for (const [name, text] of OBJECT_ENTRIES(SQL)) {
    if (typeof text !== 'string') continue;
    assert.ok(text.trim().length > 20, `${name} is too short to be a statement`);
    const withoutDeclares = text.replace(/^\s*DECLARE\s+.*?;/gim, '');
    const semicolons = (withoutDeclares.match(/;/g) || []).length;
    assert.ok(semicolons <= 1, `${name} seems to hold more than one statement`);
    assert.match(text, /\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i, `${name} has no data operation`);
  }
});

test('no statement is built from strings (the door to SQL injection)', () => {
  for (const [name, text] of OBJECT_ENTRIES(SQL)) {
    if (typeof text !== 'string') continue;
    assert.ok(!text.includes('${'), `${name} uses a template placeholder`);
    // a parameter may be concatenated with a wildcard inside the statement (that is SQL, and
    // the value itself is still bound), but a JavaScript value may never be pasted into it
    assert.ok(!/=\s*'\s*\+\s*[A-Za-z_]+\b(?!%')/.test(text), `${name} joins a JavaScript value into the text`);
  }
  // the services may not build SQL either
  const forbidden = /(query|queryOne|execute)\(\s*`[^`]*\$\{/g;
  assert.equal(forbidden.test(SOURCE_TEXT), false, 'a service builds a statement with a placeholder');
});

test('the calls of the services bind their inputs as parameters', () => {
  const usedNames = new Set();
  for (const file of SOURCE_FILES) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/SQL\.([A-Z0-9_]+)/g)) usedNames.add(match[1]);
  }
  assert.ok(usedNames.size > 40, `only ${usedNames.size} statements are used by the code`);
  for (const name of usedNames) {
    assert.ok(SQL[name], `SQL.${name} is used but not defined`);
  assert.equal(typeof SQL[name], 'string', `SQL.${name} is not a statement`);
  }
  const defined = Object.keys(SQL).filter((name) => typeof SQL[name] === 'string');
  const unused = defined.filter((name) => !usedNames.has(name) && !['S5_TABLE_COUNTS'].includes(name));
  assert.deepEqual(unused, [], 'these statements are defined but never used');
});

test('a statement that filters by user input takes it as a parameter', () => {
  for (const name of ['B3_CATALOGUE', 'D2_USER_LIST', 'D19_PAYMENTS', 'B13_ANNOUNCEMENTS_FOR_STUDENT']) {
    assert.match(SQL[name], /@\w+/, `${name} has to use parameters`);
    assert.ok(!/@\s*'/.test(SQL[name]), `${name} pastes a value into the text`);
  }
});

test('the procedures that enforce the rules are called by name', () => {
  for (const procedure of ['sp_RegisterStudent', 'sp_DropEnrollment', 'sp_PublishGrades', 'sp_CreateFirstAdmin']) {
    assert.ok(SOURCE_TEXT.includes(procedure), `${procedure} is never called`);
    assert.ok(!SOURCE_TEXT.includes(`EXEC dbo.${procedure}`), `${procedure} has to be run through request.execute`);
  }
});

function OBJECT_ENTRIES(object) {
  return Object.entries(object).filter(([, value]) => typeof value === 'string');
}
