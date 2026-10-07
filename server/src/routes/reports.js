/**
 * The reporting routes.
 *
 * A client sends the key of a report and the values of its parameters; the SQL text lives in
 * the registry on the server and never travels over the network. An administrator sees every
 * report, an instructor sees the reports of teaching and only about their own sections.
 */
import { Router } from 'express';
import * as reportService from '../services/reportService.js';
import * as SQL from '../sql/statements.js';
import { query } from '../db.js';
import { ok, route } from '../http/respond.js';
import { requireRole } from '../middleware/auth.js';

export const reportsRouter = Router();

reportsRouter.use(requireRole('Admin', 'Instructor'));

reportsRouter.get('/', route(async (req, res) => (
  ok(res, reportService.catalogue(req.user.role))
)));

/** the dropdowns of the parameter form: semesters, sections and (for the office) students */
reportsRouter.get('/options', route(async (req, res) => {
  const semesters = await query(SQL.D14_SEMESTERS);
  const sections = req.user.role === 'Instructor'
    ? await query(SQL.C1_MY_SECTIONS, { InstructorId: req.user.userId, SemesterId: null })
    : await query(SQL.D4_SECTION_FILL, { SemesterId: null });
  const students = req.user.role === 'Admin' ? await query(SQL.D31_STUDENT_OPTIONS) : [];
  return ok(res, {
    semesters: semesters.map((row) => ({ id: row.SemesterId, label: row.Name })),
    sections: sections.map((row) => ({
      id: row.SectionId,
      label: `${row.CourseCode} ${row.SectionCode} — ${row.SemesterName}`,
    })),
    students: students.map((row) => ({
      id: row.UserId,
      label: `${row.StudentNumber} — ${row.FullName} (${row.ProgramName})`,
    })),
  });
}));

reportsRouter.get('/:key', route(async (req, res) => (
  ok(res, await reportService.runReport(req.params.key, req.query, req.user))
)));
