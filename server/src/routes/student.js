/**
 * The student pages of the API. Every route here knows the student from the session, so a
 * student can only ever read and change their own data: the identifier is never taken from
 * the request.
 */
import { Router } from 'express';
import * as studentService from '../services/studentService.js';
import { badRequest } from '../http/errors.js';
import { created, ok, route } from '../http/respond.js';
import { requireRole } from '../middleware/auth.js';

export const studentRouter = Router();

// everything below belongs to a student account
studentRouter.use(requireRole('Student'));

studentRouter.get('/overview', route(async (req, res) => (
  ok(res, await studentService.overview(req.user.userId))
)));

studentRouter.get('/semesters', route(async (req, res) => (
  ok(res, { rows: await studentService.semesters() })
)));

studentRouter.get('/courses', route(async (req, res) => (
  ok(res, await studentService.myCourses(req.user.userId, req.query.semesterId))
)));

studentRouter.get('/catalogue', route(async (req, res) => (
  ok(res, await studentService.catalogue(req.user.userId, {
    semesterId: req.query.semesterId,
    search: req.query.search,
    departmentId: req.query.departmentId,
    level: req.query.level,
  }))
)));

studentRouter.get('/sections/:sectionId/eligibility', route(async (req, res) => (
  ok(res, await studentService.canRegister(req.user.userId, req.params.sectionId))
)));

studentRouter.post('/registrations', route(async (req, res) => {
  const sectionId = req.body?.sectionId;
  if (!sectionId) throw badRequest('missing_section', 'Please choose the section you want to register in.');
  const result = await studentService.register(req.user.userId, sectionId);
  return created(res, {
    ...result,
    message: `${result.section.Code} ${result.section.Title} was added to your registration.`,
  });
}));

studentRouter.delete('/registrations/:enrollmentId', route(async (req, res) => {
  const result = await studentService.dropCourse(req.user.userId, req.params.enrollmentId);
  return ok(res, { ...result, message: `${result.course} was dropped.` });
}));

studentRouter.get('/transcript', route(async (req, res) => (
  ok(res, await studentService.transcript(req.user.userId))
)));

studentRouter.get('/timetable', route(async (req, res) => (
  ok(res, await studentService.timetable(req.user.userId, req.query.semesterId))
)));

studentRouter.get('/fees', route(async (req, res) => (
  ok(res, await studentService.feesAndPayments(req.user.userId))
)));

studentRouter.get('/attendance', route(async (req, res) => (
  ok(res, await studentService.attendance(req.user.userId))
)));

studentRouter.get('/announcements', route(async (req, res) => (
  ok(res, { rows: await studentService.announcements(req.user.userId) })
)));

studentRouter.get('/advisor', route(async (req, res) => (
  ok(res, { advisor: await studentService.advisor(req.user.userId) })
)));

studentRouter.get('/credit-load', route(async (req, res) => (
  ok(res, { load: await studentService.creditLoad(req.user.userId) })
)));
