/**
 * The office pages of the API: accounts, the catalogue, the sections, the semesters, the
 * money and the announcements. Only an administrator reaches these routes.
 */
import { Router } from 'express';
import * as adminService from '../services/adminService.js';
import * as authService from '../services/authService.js';
import * as SQL from '../sql/statements.js';
import { query } from '../db.js';
import { badRequest, forbidden } from '../http/errors.js';
import { created, ok, route } from '../http/respond.js';
import { requireRole } from '../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(requireRole('Admin'));

/* ------------------------------------------------------------------ overview */

adminRouter.get('/overview', route(async (req, res) => ok(res, await adminService.overview())));

adminRouter.get('/table-counts', route(async (req, res) => (
  ok(res, { rows: await adminService.tableCounts() })
)));

/* ------------------------------------------------------------------ accounts */

adminRouter.get('/users', route(async (req, res) => (
  ok(res, {
    rows: await adminService.users({
      role: req.query.role || null,
      status: req.query.status === undefined || req.query.status === '' ? null : req.query.status,
      search: req.query.search || null,
    }),
  })
)));

adminRouter.patch('/users/:userId/active', route(async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') {
    throw badRequest('missing_is_active', 'The request has to say whether the account becomes active or not.');
  }
  const result = await adminService.setActive(req.user.userId, req.params.userId, isActive);
  return ok(res, {
    ...result,
    message: isActive
      ? `${result.fullName} can sign in now.`
      : `${result.fullName} cannot sign in any more.`,
  });
}));

adminRouter.post('/admins', route(async (req, res) => {
  const result = await adminService.createAdmin(req.user.userId, req.body || {});
  return created(res, { ...result, message: `${result.fullName} is an administrator now.` });
}));

adminRouter.get('/students', route(async (req, res) => (
  ok(res, { rows: await query(SQL.D31_STUDENT_OPTIONS) })
)));

/* ------------------------------------------------------------------ catalogue */

adminRouter.get('/catalogue', route(async (req, res) => (
  ok(res, await adminService.catalogue(req.query.search || null))
)));

adminRouter.post('/courses', route(async (req, res) => {
  const result = await adminService.createCourse(req.body || {});
  return created(res, { ...result, message: `${result.code} was added to the catalogue.` });
}));

adminRouter.patch('/courses/:courseId', route(async (req, res) => {
  const result = await adminService.updateCourse(req.params.courseId, req.body || {});
  return ok(res, { ...result, message: `${result.code} was updated.` });
}));

/* ------------------------------------------------------------------ sections */

adminRouter.get('/sections', route(async (req, res) => (
  ok(res, await adminService.sections({ semesterId: req.query.semesterId || null }))
)));

adminRouter.post('/sections', route(async (req, res) => {
  const result = await adminService.createSection(req.body || {});
  return created(res, {
    ...result,
    message: `Section ${result.course} of ${result.semester} was created.`,
  });
}));

adminRouter.patch('/sections/:sectionId', route(async (req, res) => {
  const result = await adminService.updateSection(req.params.sectionId, req.body || {});
  return ok(res, { ...result, message: 'The section was updated.' });
}));

adminRouter.delete('/sections/:sectionId', route(async (req, res) => {
  const result = await adminService.deleteSection(req.params.sectionId);
  return ok(res, { ...result, message: 'The section was deleted.' });
}));

/* ------------------------------------------------------------------ semesters */

adminRouter.get('/semesters', route(async (req, res) => (
  ok(res, { rows: await adminService.semesters() })
)));

adminRouter.post('/semesters', route(async (req, res) => {
  const result = await adminService.createSemester(req.body || {});
  return created(res, { ...result, message: `${result.name} was created.` });
}));

adminRouter.patch('/semesters/:semesterId', route(async (req, res) => {
  const result = await adminService.updateSemester(req.params.semesterId, req.body || {});
  return ok(res, {
    ...result,
    message: result.registrationOpen
      ? 'Registration is open for this semester, and closed for the others.'
      : 'Registration is closed for this semester.',
  });
}));

/* ------------------------------------------------------------------ money */

adminRouter.get('/rooms', route(async (req, res) => ok(res, { rows: await adminService.rooms() })));

adminRouter.get('/payments', route(async (req, res) => (
  ok(res, await adminService.payments({ semesterId: req.query.semesterId || null, search: req.query.search || null }))
)));

adminRouter.post('/payments', route(async (req, res) => {
  if (!req.user.canRecordPayments) {
    throw forbidden('Your administrator account may not record payments.', 'no_payment_permission');
  }
  const result = await adminService.recordPayment(req.user.userId, req.body || {});
  return created(res, {
    ...result,
    message: `${result.amount} was received from ${result.studentName}. Receipt ${result.receiptNumber}.`,
  });
}));

adminRouter.get('/fees-not-paid', route(async (req, res) => (
  ok(res, { rows: await adminService.feesNotPaid() })
)));

/* ------------------------------------------------------------------ announcements */

adminRouter.get('/announcements', route(async (req, res) => (
  ok(res, { rows: await adminService.announcements() })
)));

adminRouter.post('/announcements', route(async (req, res) => {
  const result = await adminService.postAnnouncement(req.user.userId, req.body || {});
  return created(res, { ...result, message: 'The announcement was published for everybody.' });
}));

adminRouter.delete('/announcements/:announcementId', route(async (req, res) => {
  const result = await adminService.deleteAnnouncement(req.params.announcementId);
  return ok(res, { ...result, message: 'The announcement was removed.' });
}));

/* ------------------------------------------------------------------ sign up options */

adminRouter.get('/signup-options', route(async (req, res) => (
  ok(res, await authService.listSignUpOptions())
)));
