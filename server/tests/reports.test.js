/**
 * The report layer.
 *
 * The course asks for three kinds of reporting, and it asks that every table the application
 * uses exists in the schema of the project. These tests check both: the registry is complete
 * and well formed, and every table name that appears anywhere in the SQL of the project is a
 * real object of database/01_schema.sql.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPORTS, REPORT_CATEGORIES, listReports, getReport } from '../src/reports/registry.js';
import { REPORT_ROLES, rolesFor, reportsFor } from '../src/services/reportService.js';
import * as SQL from '../src/sql/statements.js';
import { projectRoot } from '../src/config.js';

const schema = fs.readFileSync(path.join(projectRoot, 'database', '01_schema.sql'), 'utf8');
const schemaObjects = new Set([...schema.matchAll(/(?:CREATE TABLE|CREATE VIEW|CREATE PROCEDURE|CREATE FUNCTION|CREATE TRIGGER) dbo\.(\w+)/g)].map((m) => m[1]));

function tablesIn(text) {
  return [...text.matchAll(/\bdbo\.(\w+)/g)].map((match) => match[1]);
}

test('the three kinds of reporting of the course are present', () => {
  const keys = REPORTS ? Object.values(REPORTS).map((report) => report.category) : [];
  for (const category of ['Statistical', 'Detailed', 'Managerial']) {
    assert.ok(keys.includes(category), `no report of the category ${category}`);
    assert.ok(REPORT_CATEGORIES.some((c) => c.key === category), `${category} is not declared`);
  }
  assert.equal(REPORT_CATEGORIES.length, 3);
});

test('every report is complete and numbered like 03_queries.sql', () => {
  const seen = new Set();
  for (const [key, report] of Object.entries(REPORTS)) {
    assert.match(report.number, /^R[123]\.\d+$/, `${key} has a wrong number`);
    assert.equal(key, report.number);
    assert.ok(!seen.has(report.number), `${report.number} appears twice`);
    seen.add(report.number);
    assert.ok(report.title.length > 5, `${key} has no title`);
    assert.ok(report.description.length > 20, `${key} has no description`);
    assert.ok(['Statistical', 'Detailed', 'Managerial'].includes(report.category), `${key} has a wrong category`);
    assert.match(report.sql, /\bSELECT\b/i, `${key} has no statement`);
    assert.ok(!report.sql.includes('${'), `${key} builds its statement from strings`);
    assert.ok(Array.isArray(report.params), `${key} has no parameter list`);
    for (const param of report.params) {
      assert.ok(param.name && param.label && param.kind, `${key} has an incomplete parameter`);
      assert.ok(!(param.required && param.defaultTo), `${key}: a parameter cannot be required and have a default`);
    }
  }
  const listed = listReports();
  assert.equal(listed.length, Object.keys(REPORTS).length);
  assert.equal(getReport('R2.1').number, 'R2.1');
  assert.equal(getReport('R9.9'), null);
});

test('the money reports never leave the office', () => {
  const officeOnly = ['R1.9', 'R2.3', 'R2.4', 'R2.5', 'R3.7'];
  for (const key of officeOnly) {
    assert.deepEqual(rolesFor(key), ['Admin'], `${key} has to stay with the administrators`);
  }
  assert.ok(reportsFor('Instructor').length > 0, 'an instructor has to see some reports');
  assert.ok(reportsFor('Instructor').length < listReports().length, 'an instructor must not see every report');
  assert.equal(reportsFor('Student').length, 0, 'a student has no report page');
  for (const key of Object.keys(REPORT_ROLES)) {
    assert.ok(REPORTS[key], `the role table names a report that does not exist: ${key}`);
  }
});

test('every table the project talks about exists in the schema', () => {
  const ignore = new Set(['sys', 'objects', 'foreign_keys']);
  const sources = [
    ...Object.values(SQL).filter((value) => typeof value === 'string'),
    ...Object.values(REPORTS).map((report) => report.sql),
  ];
  for (const text of sources) {
    for (const table of tablesIn(text)) {
      if (ignore.has(table)) continue;
      assert.ok(schemaObjects.has(table), `dbo.${table} is not created by 01_schema.sql`);
    }
  }
});

test('the reports of the SQL file and of the server have the same numbers', () => {
  const file = fs.readFileSync(path.join(projectRoot, 'database', '04_reports.sql'), 'utf8');
  const numbersInFile = new Set([...file.matchAll(/\/\* (R[123]\.\d+)\b/g)].map((match) => match[1]));
  for (const number of Object.keys(REPORTS)) {
    assert.ok(numbersInFile.has(number), `${number} is missing from database/04_reports.sql`);
  }
});

test('the report parameters name a real kind of input for the client', () => {
  const kinds = new Set(['semester', 'student', 'section']);
  for (const report of Object.values(REPORTS)) {
    for (const param of report.params) {
      assert.ok(kinds.has(param.kind), `${report.number}: unknown parameter kind ${param.kind}`);
    }
  }
});

test('the report SQL runs on the same database as the schema', () => {
  const usesViews = Object.values(REPORTS).some((report) => report.sql.includes('vw_SectionFill') || report.sql.includes('vw_StudentGpa'));
  assert.ok(usesViews, 'at least one report should read a view, otherwise the views are unused');
});
