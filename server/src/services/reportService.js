/**
 * Running a report.
 *
 * The client sends the key of a report (for example "R3.4") and the values of its
 * parameters. This file turns that into one parameterised statement: the SQL text always
 * comes from the registry, never from the request, so the report page can never be used to
 * run a statement that the project did not write.
 */
import * as SQL from '../sql/statements.js';
import { query, queryOne } from '../db.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { REPORTS, categoryOf, getReport, listReports } from '../reports/registry.js';

/**
 * Who may run which report. Everything is for the administrator; the reports that belong to
 * teaching are also for an instructor, and then only about the instructor's own sections.
 */
export const REPORT_ROLES = {
  'R1.2': ['Admin', 'Instructor'],
  'R1.3': ['Admin', 'Instructor'],
  'R1.4': ['Admin', 'Instructor'],
  'R1.7': ['Admin', 'Instructor'],
  'R1.8': ['Admin', 'Instructor'],
  'R2.2': ['Admin', 'Instructor'],
  'R2.6': ['Admin', 'Instructor'],
  'R2.7': ['Admin', 'Instructor'],
  'R2.8': ['Admin', 'Instructor'],
  'R2.9': ['Admin', 'Instructor'],
  'R3.1': ['Admin', 'Instructor'],
  'R3.2': ['Admin', 'Instructor'],
  'R3.4': ['Admin', 'Instructor'],
  'R3.5': ['Admin', 'Instructor'],
  'R3.8': ['Admin', 'Instructor'],
};

export function rolesFor(key) {
  return REPORT_ROLES[key] || ['Admin'];
}

export function reportsFor(role) {
  return listReports().filter((report) => rolesFor(report.key).includes(role));
}

async function openSemesterId() {
  const term = await queryOne(SQL.B2_OPEN_SEMESTER);
  if (!term) throw notFound('There is no open semester, so this report has no term to work on.', 'no_open_semester');
  return term.SemesterId;
}

/**
 * Fill in and check the parameters of one report.
 * A parameter that is not required and not given stays NULL, and the statement treats NULL
 * as "no filter" (see the (@X IS NULL OR ...) pattern in 03_queries.sql).
 */
async function resolveParams(report, raw, caller) {
  const values = {};
  for (const param of report.params) {
    const given = raw?.[param.name];
    if (given === undefined || given === null || given === '') {
      if (param.defaultTo === 'openSemester') {
        values[param.name] = await openSemesterId();
        continue;
      }
      if (param.required) {
        throw badRequest('missing_parameter', `The report "${report.title}" needs ${param.label.toLowerCase()}.`);
      }
      values[param.name] = null;
      continue;
    }
    const id = Number.parseInt(given, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest('bad_parameter', `${param.label} is not a valid identifier.`);
    }
    values[param.name] = id;
  }

  // an instructor may only look at their own sections
  if (caller?.role === 'Instructor' && values.SectionId) {
    const owned = await queryOne(SQL.C3_SECTION_OF_INSTRUCTOR, {
      SectionId: values.SectionId,
      InstructorId: caller.userId,
    });
    if (!owned) throw forbidden('That section is not one of your sections.', 'not_your_section');
  }
  if (caller?.role === 'Instructor' && report.params.some((p) => p.kind === 'student')) {
    throw forbidden('Transcripts of students belong to the student office.', 'not_allowed');
  }
  return values;
}

/** the numbers of a table are added up, so the footer of the screen can show totals */
function totalsOf(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const totals = {};
  for (const [key, value] of Object.entries(rows[0])) {
    if (typeof value === 'number' || (value && typeof value === 'object' && value.constructor === Number)) {
      const sum = rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
      totals[key] = Math.round(sum * 100) / 100;
    }
  }
  return Object.keys(totals).length ? totals : null;
}

export async function runReport(key, rawParams, caller) {
  const report = getReport(key);
  if (!report) throw notFound(`There is no report with the key ${key}.`, 'unknown_report');
  if (!rolesFor(key).includes(caller.role)) {
    throw forbidden('Your account is not allowed to run this report.', 'report_forbidden');
  }

  const params = await resolveParams(report, rawParams, caller);
  const rows = await query(report.sql, params);
  const columns = rows.length ? Object.keys(rows[0]) : Object.keys(report.labels || {});
  return {
    key: report.number,
    title: report.title,
    category: report.category,
    description: report.description,
    params: report.params,
    usedParams: params,
    labels: report.labels || {},
    columns,
    rows,
    rowCount: rows.length,
    totals: totalsOf(rows),
  };
}

export function catalogue(role) {
  const reports = reportsFor(role);
  return {
    reports,
    categories: [...new Set(reports.map((report) => categoryOf(report.key)))],
  };
}

export const reportCount = Object.keys(REPORTS).length;
