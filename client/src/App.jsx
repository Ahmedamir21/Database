/**
 * The shell of the application: who is signed in, which menu that person gets, and which
 * page belongs to which address.
 *
 * The navigation is built from the role of the signed in account, so a student never sees a
 * link to the office pages (and the API would refuse it anyway: the menu is convenience, the
 * check is on the server).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import api, { isMock } from './api.js';
import { Badge, Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import SignUp from './pages/SignUp.jsx';
import StudentDashboard from './pages/student/Dashboard.jsx';
import Catalogue from './pages/student/Catalogue.jsx';
import MyCourses from './pages/student/MyCourses.jsx';
import Transcript from './pages/student/Transcript.jsx';
import Attendance from './pages/student/Attendance.jsx';
import Fees from './pages/student/Fees.jsx';
import Announcements from './pages/shared/Announcements.jsx';
import Profile from './pages/shared/Profile.jsx';
import TeachingDashboard from './pages/instructor/Dashboard.jsx';
import SectionWorkspace from './pages/instructor/SectionWorkspace.jsx';
import MyStudents from './pages/instructor/MyStudents.jsx';
import OfficeOverview from './pages/admin/Overview.jsx';
import Users from './pages/admin/Users.jsx';
import CourseCatalogue from './pages/admin/CourseCatalogue.jsx';
import Sections from './pages/admin/Sections.jsx';
import Semesters from './pages/admin/Semesters.jsx';
import Payments from './pages/admin/Payments.jsx';
import OfficeAnnouncements from './pages/admin/Announcements.jsx';
import DatabaseFacts from './pages/admin/DatabaseFacts.jsx';
import Reports from './pages/Reports.jsx';
import NotFound from './pages/NotFound.jsx';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const MENUS = {
  Student: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/catalogue', label: 'Registration' },
    { to: '/courses', label: 'My courses' },
    { to: '/transcript', label: 'Transcript' },
    { to: '/attendance', label: 'Attendance' },
    { to: '/fees', label: 'Fees and payments' },
    { to: '/announcements', label: 'Announcements' },
    { to: '/profile', label: 'My profile' },
  ],
  Instructor: [
    { to: '/teaching', label: 'My sections' },
    { to: '/teaching/students', label: 'My students' },
    { to: '/announcements', label: 'Announcements' },
    { to: '/reports', label: 'Reports' },
    { to: '/profile', label: 'My profile' },
  ],
  Admin: [
    { to: '/office', label: 'Overview' },
    { to: '/office/users', label: 'Users' },
    { to: '/office/catalogue', label: 'Courses' },
    { to: '/office/sections', label: 'Sections' },
    { to: '/office/semesters', label: 'Semesters' },
    { to: '/office/payments', label: 'Payments' },
    { to: '/office/announcements', label: 'Announcements' },
    { to: '/office/database', label: 'Database' },
    { to: '/reports', label: 'Reports' },
    { to: '/profile', label: 'My profile' },
  ],
};

const HOME = { Student: '/dashboard', Instructor: '/teaching', Admin: '/office' };

function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const answer = await api.me();
      setUser(answer.user);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    refresh,
    async signIn(email, password) {
      const answer = await api.login(email, password);
      setUser(answer.user);
      return answer.user;
    },
    async signOut() {
      await api.logout();
      setUser(null);
    },
    setUser,
  }), [user, loading, error, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function Shell({ children }) {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const menu = user ? MENUS[user.role] || [] : [];

  if (!user) return children;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-brand-700/40 bg-brand-600 text-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
          <Link to={HOME[user.role] || '/'} className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-400 font-serif text-[1.15rem] font-bold text-brand-700">Z</span>
            <span className="leading-tight">
              <span className="block font-serif text-[1.05rem]">Zewail Desk</span>
              <span className="block text-[0.7rem] uppercase tracking-[0.14em] text-brand-100">student information system</span>
            </span>
          </Link>

          <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-[0.88rem] font-medium transition ${
                  isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            {isMock() && <Badge tone="gold">mock data</Badge>}
            <div className="hidden text-right leading-tight sm:block">
              <span className="block text-[0.86rem] font-semibold">{user.fullName}</span>
              <span className="block text-[0.72rem] text-brand-100">
                {user.role}{user.studentNumber ? ` · ${user.studentNumber}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/30 px-2.5 py-1.5 text-[0.82rem] hover:bg-white/10"
              onClick={async () => { await signOut(); navigate('/login'); }}
            >
              Sign out
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/30 px-2.5 py-1.5 text-[0.82rem] lg:hidden"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>
        </div>

        {open && (
          <nav className="grid gap-1 border-t border-white/20 px-4 py-2 lg:hidden">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-[0.88rem] ${isActive ? 'bg-white/15' : 'text-brand-100'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">{children}</main>

      <footer className="no-print border-t border-ink-200 bg-white px-4 py-3 text-center text-[0.78rem] text-ink-500">
        CSAI 202 Introduction to Database Systems · Zewail City of Science, Technology and Innovation ·
        {' '}every number on these pages comes from the project database through the API
      </footer>
    </div>
  );
}

function RequireRole({ roles, children }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role] || '/'} replace />;
  return children;
}

function Home() {
  const { user, loading } = useSession();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME[user.role] || '/'} replace />;
}

export default function App() {
  return (
    <SessionProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          <Route path="/dashboard" element={<RequireRole roles={['Student']}><StudentDashboard /></RequireRole>} />
          <Route path="/catalogue" element={<RequireRole roles={['Student']}><Catalogue /></RequireRole>} />
          <Route path="/courses" element={<RequireRole roles={['Student']}><MyCourses /></RequireRole>} />
          <Route path="/transcript" element={<RequireRole roles={['Student']}><Transcript /></RequireRole>} />
          <Route path="/attendance" element={<RequireRole roles={['Student']}><Attendance /></RequireRole>} />
          <Route path="/fees" element={<RequireRole roles={['Student']}><Fees /></RequireRole>} />

          <Route path="/teaching" element={<RequireRole roles={['Instructor']}><TeachingDashboard /></RequireRole>} />
          <Route path="/teaching/sections/:sectionId" element={<RequireRole roles={['Instructor']}><SectionWorkspace /></RequireRole>} />
          <Route path="/teaching/students" element={<RequireRole roles={['Instructor']}><MyStudents /></RequireRole>} />

          <Route path="/office" element={<RequireRole roles={['Admin']}><OfficeOverview /></RequireRole>} />
          <Route path="/office/users" element={<RequireRole roles={['Admin']}><Users /></RequireRole>} />
          <Route path="/office/catalogue" element={<RequireRole roles={['Admin']}><CourseCatalogue /></RequireRole>} />
          <Route path="/office/sections" element={<RequireRole roles={['Admin']}><Sections /></RequireRole>} />
          <Route path="/office/semesters" element={<RequireRole roles={['Admin']}><Semesters /></RequireRole>} />
          <Route path="/office/payments" element={<RequireRole roles={['Admin']}><Payments /></RequireRole>} />
          <Route path="/office/announcements" element={<RequireRole roles={['Admin']}><OfficeAnnouncements /></RequireRole>} />
          <Route path="/office/database" element={<RequireRole roles={['Admin']}><DatabaseFacts /></RequireRole>} />

          <Route path="/reports" element={<RequireRole roles={['Admin', 'Instructor']}><Reports /></RequireRole>} />
          <Route path="/reports/:key" element={<RequireRole roles={['Admin', 'Instructor']}><Reports /></RequireRole>} />

          <Route path="/announcements" element={<RequireRole><Announcements /></RequireRole>} />
          <Route path="/profile" element={<RequireRole><Profile /></RequireRole>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </SessionProvider>
  );
}
