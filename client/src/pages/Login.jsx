/**
 * The sign in page.
 *
 * It shows the three demonstration accounts of the sample data (the password is the same for
 * all of them and it is written in database/02_seed.sql as a bcrypt hash, never as text in a
 * table), and whether the API can reach the database, so that a reviewer immediately knows
 * what is running.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { isMock } from '../api.js';
import { useSession } from '../App.jsx';
import { Badge, Card, Field, Note } from '../components/ui.jsx';

const DEMO = [
  { email: 'mina.ibrahim1@zewailcity.edu.eg', role: 'Student', who: 'Mina Ibrahim · 20230001' },
  { email: 'ahmed.hassan@zewailcity.edu.eg', role: 'Instructor', who: 'Ahmed Hassan · Dr., CSAI' },
  { email: 'sara.ibrahim@zewailcity.edu.eg', role: 'Admin', who: 'Sara Ibrahim · Head of Student Records' },
];

export default function Login() {
  const { signIn, user } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (user) navigate(user.role === 'Student' ? '/dashboard' : user.role === 'Instructor' ? '/teaching' : '/office', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch((requestError) => setHealth({
        error: requestError.message,
        code: requestError.code,
        details: requestError.details,
      }));
    api.summary().then(setSummary).catch(() => setSummary(null));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(email.trim(), password);
      navigate(signedIn.role === 'Student' ? '/dashboard' : signedIn.role === 'Instructor' ? '/teaching' : '/office');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5 py-4 lg:grid-cols-[1.05fr_1fr]">
      <section className="card overflow-hidden">
        <div className="bg-brand-600 px-6 py-7 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-400 font-serif text-[1.5rem] font-bold text-brand-700">Z</span>
          <h1 className="mt-3 font-serif text-[1.7rem] leading-tight">Zewail Desk</h1>
          <p className="mt-1 text-[0.92rem] text-brand-100">
            The self service portal of the student information system: registration, grades,
            attendance, fees and the reports of the office.
          </p>
        </div>
        <div className="card-pad">
          <h2 className="text-[0.95rem] font-semibold text-brand-600">The project in numbers</h2>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            {summary ? (
              <>
                <Fact label="Students" value={summary.counts.Students} />
                <Fact label="Courses" value={summary.counts.Courses} />
                <Fact label="Sections" value={summary.counts.Sections} />
                <Fact label="Enrollments" value={summary.counts.Enrollments} />
                <Fact label="Instructors" value={summary.counts.Instructors} />
                <Fact label="Reports" value={summary.reports} />
              </>
            ) : (
              <p className="col-span-3 text-[0.86rem] text-ink-500">The numbers of the sample data appear here when the API answers.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.82rem]">
            {health && !health.error && (
              <>
                <Badge tone={health.database === 'up' ? 'success' : 'warn'}>
                  API: {health.database === 'up' ? 'SQL Server connected' : health.database}
                </Badge>
                <span className="text-ink-500">{health.connection}</span>
                {health.deployment?.commit && (
                  <span className="text-ink-400">build {health.deployment.commit}</span>
                )}
              </>
            )}
            {health?.error && (
              <>
                <Badge tone="danger">{health.error}</Badge>
                {(health.details?.missing?.length > 0 || health.details?.connection) && (
                  <span className="text-ink-500">
                    {health.details.missing?.length
                      ? `missing in the deployment: ${health.details.missing.join(', ')}`
                      : health.details.connection}
                  </span>
                )}
                {health.details?.deployment?.commit && (
                  <span className="text-ink-400">build {health.details.deployment.commit}</span>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid content-start gap-4">
        <Card title="Sign in">
          <form className="grid gap-3" onSubmit={submit}>
            <Field label="University e-mail">
              <input
                className="input" type="email" value={email} autoComplete="username" required
                onChange={(event) => setEmail(event.target.value)}
                placeholder="first.last@zewailcity.edu.eg"
              />
            </Field>
            <Field label="Password">
              <input
                className="input" type="password" value={password} autoComplete="current-password" required
                onChange={(event) => setPassword(event.target.value)} placeholder="••••••••"
              />
            </Field>
            {error && <Note tone="danger">{error}</Note>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center text-[0.85rem] text-ink-500">
              New student or instructor? <Link className="font-semibold text-brand-600 hover:underline" to="/signup">Create an account</Link>
            </p>
          </form>
        </Card>

        <Card title="Demonstration accounts" subtitle={isMock() ? 'The interface is running on the mock data (no SQL Server needed).' : 'The password of every sample account is Desk#2025.'}>
          <ul className="grid gap-2">
            {DEMO.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[0.88rem] font-medium text-ink-800">{account.who}</p>
                  <p className="truncate text-[0.78rem] text-ink-500">{account.email}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 px-2.5 py-1 text-[0.8rem]"
                  onClick={() => { setEmail(account.email); setPassword(isMock() ? 'Desk#2025' : ''); }}
                >
                  use
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.78rem] text-ink-500">
            The password is stored in the database as a bcrypt hash (cost 10) and it is never
            written in the source code. The sign in form sends it once, over the API, and the
            session travels in an httpOnly cookie.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-200 px-2 py-2">
      <p className="font-serif text-[1.2rem] text-brand-600">{value}</p>
      <p className="text-[0.72rem] uppercase tracking-wide text-ink-500">{label}</p>
    </div>
  );
}
