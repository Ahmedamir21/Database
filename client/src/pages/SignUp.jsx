/**
 * The sign up page: a student account works immediately, an instructor account waits for the
 * approval of an administrator (IsActive = 0 until then), exactly like the requirements ask.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useSession } from '../App.jsx';
import { Card, Field, Note, Select } from '../components/ui.jsx';

const TABS = [
  { key: 'student', label: 'I am a student' },
  { key: 'instructor', label: 'I am a teacher' },
];

export default function SignUp() {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState('student');
  const [options, setOptions] = useState({ programs: [], departments: [] });
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    programId: '', enrollmentYear: String(new Date().getFullYear()),
    departmentId: '', title: 'T.A.', specialization: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.signUpOptions().then(setOptions).catch(() => setOptions({ programs: [], departments: [] }));
  }, []);

  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'student') {
        const answer = await api.signUp(form);
        setUser(answer.user);
        navigate('/dashboard');
        return;
      }
      const answer = await api.signUpInstructor(form);
      setDone(answer.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const programs = options.programs.map((program) => ({
    value: program.ProgramId,
    label: `${program.Name} (${program.DepartmentCode}, ${program.TotalCreditHours} credits)`,
  }));
  const departments = options.departments.map((department) => ({
    value: department.DepartmentId,
    label: `${department.Code} — ${department.Name}`,
  }));

  return (
    <div className="mx-auto max-w-2xl py-4">
      <Card
        title="Create an account"
        subtitle="The e-mail address and the password belong to you; the office sees your record, never your password."
      >
        <div className="mb-4 flex gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn ${tab === item.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setTab(item.key); setError(null); setDone(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {done ? (
          <div className="grid gap-3">
            <Note tone="success">{done}</Note>
            <p className="text-[0.88rem] text-ink-500">
              An administrator of the student office approves the account from the “Users” page;
              after that the account can sign in.
            </p>
          </div>
        ) : (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <Field label="Full name" className="sm:col-span-2">
              <input className="input" value={form.fullName} onChange={change('fullName')} required minLength={3} />
            </Field>
            <Field label="University e-mail" className="sm:col-span-2">
              <input className="input" type="email" value={form.email} onChange={change('email')} required placeholder="first.last@zewailcity.edu.eg" />
            </Field>

            {tab === 'student' ? (
              <>
                <Field label="Program">
                  <Select value={form.programId} onChange={change('programId')} options={programs} placeholder="Choose a program" />
                </Field>
                <Field label="Year of enrollment">
                  <input className="input" type="number" min="2000" max="2100" value={form.enrollmentYear} onChange={change('enrollmentYear')} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Department">
                  <Select value={form.departmentId} onChange={change('departmentId')} options={departments} placeholder="Choose a department" />
                </Field>
                <Field label="Title">
                  <Select
                    value={form.title}
                    onChange={change('title')}
                    options={[{ value: 'Prof.', label: 'Prof.' }, { value: 'Dr.', label: 'Dr.' }, { value: 'T.A.', label: 'T.A.' }]}
                  />
                </Field>
                <Field label="Specialization" className="sm:col-span-2">
                  <input className="input" value={form.specialization} onChange={change('specialization')} placeholder="Databases and information systems" />
                </Field>
              </>
            )}

            <Field label="Password" hint="At least 8 characters, with a letter and a digit.">
              <input className="input" type="password" value={form.password} onChange={change('password')} required minLength={8} />
            </Field>
            <Field label="Repeat the password">
              <input className="input" type="password" value={form.confirmPassword} onChange={change('confirmPassword')} required minLength={8} />
            </Field>

            {error && <div className="sm:col-span-2"><Note tone="danger">{error}</Note></div>}

            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <Link className="text-[0.86rem] text-ink-500 hover:text-brand-600" to="/login">← Back to sign in</Link>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Creating the account…' : tab === 'student' ? 'Create my student account' : 'Ask for a teacher account'}
              </button>
            </div>
          </form>
        )}
      </Card>

      <p className="mt-3 px-1 text-[0.8rem] text-ink-500">
        The first administrator of the system is not created here: it is created once, from the
        server, with <code>npm run seed:admin</code>, which calls the procedure
        <code> sp_CreateFirstAdmin</code>. Every further administrator is created by an
        administrator from the “Users” page.
      </p>
    </div>
  );
}
