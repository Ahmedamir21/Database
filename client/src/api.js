/**
 * One place that talks to the API.
 *
 * Two modes, chosen with VITE_API_MODE:
 *
 *   real (the default)  the browser calls /api/... , the Vite development server proxies the
 *                       call to the Express API, and the session travels in an httpOnly
 *                       cookie that this file never sees or stores
 *   mock                the answers come from src/mock/handlers.js, with the same shape as
 *                       the real API, so the interface can be shown when no SQL Server is
 *                       reachable (the demonstration of the interface, the screenshots)
 *
 * The rest of the application does not know which mode is running: every screen calls
 * api.student.catalogue() and gets the same data either way.
 *
 * Where the API lives: normally the pages and the API are one deployment, and the relative
 * path /api is enough. When the client is deployed on its own (its own Vercel project), set
 * VITE_API_BASE_URL to the address of the API deployment at build time, for instance
 *
 *     VITE_API_BASE_URL=https://database-xxxx.vercel.app
 *
 * and the session cookie travels between the two because the API is configured with
 * CLIENT_ORIGIN and COOKIE_SAMESITE=none. See docs/DEPLOYMENT.md.
 */
import { mockRequest, mockSession } from './mock/handlers.js';

const MODE = (import.meta.env.VITE_API_MODE || 'real').toLowerCase();
/** the address of the API when the client is not served by it (empty = same origin) */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export const apiMode = MODE === 'mock' ? 'mock' : 'real';
export const isMock = () => apiMode === 'mock';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'The request failed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request(path, { method = 'GET', body, params } = {}) {
  if (isMock()) {
    // a small delay, so loading states are visible in the demonstration as well
    await new Promise((resolve) => setTimeout(resolve, 90));
    try {
      return await mockRequest(path, { method, body, params });
    } catch (mockError) {
      throw new ApiError(mockError.status || 400, mockError.code || 'request_failed', mockError.message);
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}${queryString(params)}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    throw new ApiError(0, 'network', 'The API is not reachable. Is the server running on port 4000?');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    const error = payload?.error || {};
    throw new ApiError(response.status, error.code || 'request_failed', error.message, error.details);
  }
  return payload?.data ?? null;
}

const get = (path, params) => request(path, { params });
const post = (path, body) => request(path, { method: 'POST', body });
const patch = (path, body) => request(path, { method: 'PATCH', body });
const del = (path, body) => request(path, { method: 'DELETE', body });

export const api = {
  mode: apiMode,
  isMock,

  /* ---- public ------------------------------------------------------------------- */
  health: () => get('/meta/health'),
  summary: () => get('/meta/summary'),
  semesters: () => get('/meta/semesters'),
  departments: () => get('/meta/departments'),

  /* ---- accounts ----------------------------------------------------------------- */
  login: (email, password) => post('/auth/login', { email, password }),
  logout: () => post('/auth/logout', {}),
  me: () => get('/auth/me'),
  signUpOptions: () => get('/auth/signup-options'),
  signUp: (body) => post('/auth/signup', body),
  signUpInstructor: (body) => post('/auth/signup-instructor', body),
  changePassword: (body) => post('/auth/change-password', body),

  /* ---- student ------------------------------------------------------------------ */
  student: {
    overview: () => get('/student/overview'),
    courses: (params) => get('/student/courses', params),
    catalogue: (params) => get('/student/catalogue', params),
    eligibility: (sectionId) => get(`/student/sections/${sectionId}/eligibility`),
    register: (sectionId) => post('/student/registrations', { sectionId }),
    drop: (enrollmentId) => del(`/student/registrations/${enrollmentId}`),
    transcript: () => get('/student/transcript'),
    timetable: (params) => get('/student/timetable', params),
    fees: () => get('/student/fees'),
    attendance: () => get('/student/attendance'),
    announcements: () => get('/student/announcements'),
    advisor: () => get('/student/advisor'),
  },

  /* ---- instructor --------------------------------------------------------------- */
  instructor: {
    overview: () => get('/instructor/overview'),
    sections: (params) => get('/instructor/sections', params),
    roster: (sectionId) => get(`/instructor/sections/${sectionId}/roster`),
    statistics: (sectionId) => get(`/instructor/sections/${sectionId}/statistics`),
    setScore: (sectionId, body) => post(`/instructor/sections/${sectionId}/scores`, body),
    publish: (sectionId) => post(`/instructor/sections/${sectionId}/publish`, {}),
    attendance: (sectionId, params) => get(`/instructor/sections/${sectionId}/attendance`, params),
    saveAttendance: (sectionId, body) => post(`/instructor/sections/${sectionId}/attendance`, body),
    announcements: (sectionId) => get(`/instructor/sections/${sectionId}/announcements`),
    postAnnouncement: (sectionId, body) => post(`/instructor/sections/${sectionId}/announcements`, body),
    students: () => get('/instructor/students'),
  },

  /* ---- office ------------------------------------------------------------------- */
  admin: {
    overview: () => get('/admin/overview'),
    tableCounts: () => get('/admin/table-counts'),
    users: (params) => get('/admin/users', params),
    setActive: (userId, isActive) => patch(`/admin/users/${userId}/active`, { isActive }),
    createAdmin: (body) => post('/admin/admins', body),
    students: () => get('/admin/students'),
    catalogue: (params) => get('/admin/catalogue', params),
    createCourse: (body) => post('/admin/courses', body),
    updateCourse: (courseId, body) => patch(`/admin/courses/${courseId}`, body),
    sections: (params) => get('/admin/sections', params),
    createSection: (body) => post('/admin/sections', body),
    updateSection: (sectionId, body) => patch(`/admin/sections/${sectionId}`, body),
    deleteSection: (sectionId) => del(`/admin/sections/${sectionId}`),
    semesters: () => get('/admin/semesters'),
    createSemester: (body) => post('/admin/semesters', body),
    updateSemester: (semesterId, body) => patch(`/admin/semesters/${semesterId}`, body),
    rooms: () => get('/admin/rooms'),
    payments: (params) => get('/admin/payments', params),
    recordPayment: (body) => post('/admin/payments', body),
    announcements: () => get('/admin/announcements'),
    postAnnouncement: (body) => post('/admin/announcements', body),
    deleteAnnouncement: (announcementId) => del(`/admin/announcements/${announcementId}`),
  },

  /* ---- reports ------------------------------------------------------------------ */
  reports: {
    list: () => get('/reports'),
    options: () => get('/reports/options'),
    run: (key, params) => get(`/reports/${encodeURIComponent(key)}`, params),
  },

  /* ---- only used by the mock mode, to switch the demonstration account ---------- */
  mockSession,
};

export default api;
