/**
 * The teaching pages of the API. Each route that names a section calls the service, and the
 * service proves first that the section belongs to the signed in instructor.
 */
import { Router } from 'express';
import * as instructorService from '../services/instructorService.js';
import { badRequest } from '../http/errors.js';
import { created, ok, route } from '../http/respond.js';
import { requireRole } from '../middleware/auth.js';

export const instructorRouter = Router();

instructorRouter.use(requireRole('Instructor'));

instructorRouter.get('/overview', route(async (req, res) => (
  ok(res, await instructorService.overview(req.user.userId))
)));

instructorRouter.get('/sections', route(async (req, res) => (
  ok(res, { rows: await instructorService.mySections(req.user.userId, req.query.semesterId) })
)));

instructorRouter.get('/sections/:sectionId/roster', route(async (req, res) => (
  ok(res, await instructorService.roster(req.user.userId, req.params.sectionId))
)));

instructorRouter.get('/sections/:sectionId/statistics', route(async (req, res) => (
  ok(res, await instructorService.sectionStatistics(req.user.userId, req.params.sectionId))
)));

instructorRouter.post('/sections/:sectionId/scores', route(async (req, res) => {
  const { enrollmentId, score } = req.body || {};
  if (!enrollmentId) throw badRequest('missing_enrollment', 'The request does not say which student it is about.');
  const result = await instructorService.setScore(req.user.userId, req.params.sectionId, enrollmentId, score);
  return ok(res, result);
}));

instructorRouter.post('/sections/:sectionId/publish', route(async (req, res) => {
  const result = await instructorService.publishGrades(req.user.userId, req.params.sectionId);
  return ok(res, {
    ...result,
    message: `The grades of ${result.published} students were published.`,
  });
}));

instructorRouter.get('/sections/:sectionId/attendance', route(async (req, res) => (
  ok(res, await instructorService.attendanceSheet(req.user.userId, req.params.sectionId, req.query.date))
)));

instructorRouter.post('/sections/:sectionId/attendance', route(async (req, res) => {
  const { sessionDate, entries } = req.body || {};
  const result = await instructorService.saveAttendance(req.user.userId, req.params.sectionId, sessionDate, entries);
  return created(res, {
    ...result,
    message: `The attendance of ${result.saved} students was saved for ${result.sessionDate}.`,
  });
}));

instructorRouter.get('/sections/:sectionId/announcements', route(async (req, res) => (
  ok(res, await instructorService.sectionAnnouncements(req.user.userId, req.params.sectionId))
)));

instructorRouter.post('/sections/:sectionId/announcements', route(async (req, res) => {
  const result = await instructorService.postAnnouncement(req.user.userId, req.params.sectionId, req.body || {});
  return created(res, { ...result, message: 'The announcement was posted to the section.' });
}));

instructorRouter.get('/students', route(async (req, res) => (
  ok(res, { rows: await instructorService.myStudents(req.user.userId) })
)));
