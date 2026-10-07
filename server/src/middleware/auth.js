/**
 * Who is calling, and what is the caller allowed to do.
 *
 * The session is a signed JWT. It is kept in an httpOnly cookie, so the pages of the client
 * cannot read it and cannot leak it; the tests and the command line tools can also send the
 * same token as "Authorization: Bearer <token>".
 *
 * Two settings change on a deployment and are read from the environment:
 *
 *   secure      true in production (NODE_ENV=production, or any Vercel deployment), so the
 *               cookie only travels over https
 *   sameSite    'lax' when the pages and the API are on the same site, 'none' when the client
 *               is a separate deployment (a cookie with None must be Secure, and it is)
 *
 * The secret that signs the tokens is never a default: in production a missing or example
 * JWT_SECRET refuses every sign in with a clear message instead of signing a session anybody
 * could forge.
 */
import jwt from 'jsonwebtoken';
import { config, jwtSecretProblem } from '../config.js';
import { ApiError, forbidden, unauthorized } from '../http/errors.js';
import { getSessionUser } from '../services/authService.js';

/** in production, a session may only be signed with a real secret */
function assertSigningPossible() {
  if (!config.isProduction) return;
  const problem = jwtSecretProblem();
  if (problem) {
    throw new ApiError(
      503,
      'misconfigured_jwt_secret',
      `${problem}. Sign in is refused until the variable is set in the environment of the deployment.`,
    );
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.auth.cookieSameSite,
    secure: config.isProduction,
    domain: config.auth.cookieDomain,
    path: '/',
  };
}

export function signSession(user, extra = {}) {
  assertSigningPossible();
  return jwt.sign(
    { sub: user.userId, role: user.role, name: user.fullName, ...extra },
    config.auth.jwtSecret,
    { expiresIn: `${config.auth.tokenMinutes}m`, issuer: 'zewail-desk' },
  );
}

export function setSessionCookie(res, token) {
  res.cookie(config.auth.cookieName, token, {
    ...cookieOptions(),
    maxAge: config.auth.tokenMinutes * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  // the same path, domain and site as when the cookie was set, or the browser keeps it
  res.clearCookie(config.auth.cookieName, cookieOptions());
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[config.auth.cookieName] || null;
}

/** put req.user on the request when a valid session is present; never fails the request */
export async function attachUser(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  if (config.isProduction && jwtSecretProblem()) return next();
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, { issuer: 'zewail-desk' });
    const user = await getSessionUser(payload.sub);
    if (user && user.isActive) req.user = user;
  } catch {
    // an expired or made-up token is simply "not signed in" (and so is an unreachable database)
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized('Please sign in to use this page.'));
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('Please sign in to use this page.'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This page belongs to the ${roles.join(' and ')} accounts.`, 'wrong_role'));
    }
    return next();
  };
}

/** only an administrator, or the student themself, may read a student's record */
export function requireSelfOrRole(paramName, ...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    const asked = Number.parseInt(req.params[paramName] ?? req.query[paramName], 10);
    if (req.user.role === 'Student' && req.user.studentId === asked) return next();
    if (roles.includes(req.user.role)) return next();
    return next(forbidden('You may only read your own record.', 'not_your_record'));
  };
}
