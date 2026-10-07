/**
 * Sign in, sign up, sign out, change the password, and the session of the caller.
 *
 * The session token is put in an httpOnly cookie, so the JavaScript of the client never
 * touches it. The response body carries only what the screen needs to draw itself.
 */
import { Router } from 'express';
import * as authService from '../services/authService.js';
import { created, ok, route } from '../http/respond.js';
import { badRequest, unauthorized } from '../http/errors.js';
import {
  attachUser, clearSessionCookie, requireAuth, setSessionCookie, signSession,
} from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', route(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw badRequest('missing_credentials', 'Please type your e-mail address and your password.');
  }
  const user = await authService.login(email, password);
  setSessionCookie(res, signSession(user));
  return ok(res, { user });
}));

authRouter.post('/logout', route(async (req, res) => {
  clearSessionCookie(res);
  return ok(res, { message: 'You are signed out.' });
}));

authRouter.get('/me', attachUser, route(async (req, res) => {
  if (!req.user) return ok(res, { user: null });
  return ok(res, { user: req.user });
}));

authRouter.get('/signup-options', route(async (req, res) => {
  return ok(res, await authService.listSignUpOptions());
}));

authRouter.post('/signup', route(async (req, res) => {
  const user = await authService.signUpStudent(req.body || {});
  setSessionCookie(res, signSession(user));
  return created(res, {
    user,
    message: `Welcome, ${user.fullName}. Your student number is ${user.studentNumber}.`,
  });
}));

authRouter.post('/signup-instructor', route(async (req, res) => {
  const result = await authService.signUpInstructor(req.body || {});
  return created(res, result);
}));

authRouter.post('/change-password', attachUser, requireAuth, route(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!currentPassword) throw badRequest('missing_password', 'Please type your current password.');
  await authService.changePassword(req.user.userId, currentPassword, newPassword, confirmPassword);
  return ok(res, { message: 'Your password was changed.' });
}));

authRouter.use((req, res, next) => next(unauthorized('Please sign in to use this page.')));
