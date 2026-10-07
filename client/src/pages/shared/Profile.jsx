/**
 * The profile of the signed in person: what the database knows about the account, the advisor
 * of a student, and the form that changes the password (the current password is asked first,
 * and the new one has to be different and strong enough).
 */
import { useEffect, useState } from 'react';
import api from '../../api.js';
import { useSession } from '../../App.jsx';
import { Badge, Card, Field, KeyValue, Note, PageHeader } from '../../components/ui.jsx';
import { date } from '../../lib/format.js';

export default function Profile() {
  const { user } = useSession();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [advisor, setAdvisor] = useState(null);

  useEffect(() => {
    if (user?.role !== 'Student') return;
    let alive = true;
    api.student.advisor()
      .then((answer) => { if (alive) setAdvisor(answer.advisor || {}); })
      .catch(() => { if (alive) setAdvisor({}); });
    return () => { alive = false; };
  }, [user?.role]);

  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const answer = await api.changePassword(form);
      setMessage(answer.message);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My profile" subtitle="The account you are signed in with, and the password behind it." />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="The account">
          <KeyValue
            rows={[
              { label: 'Name', value: user?.fullName },
              { label: 'E-mail', value: user?.email },
              { label: 'Role', value: <Badge tone="info">{user?.role}</Badge> },
              user?.studentNumber && { label: 'Student number', value: user.studentNumber },
              user?.programName && { label: 'Program', value: user.programName },
              user?.level && { label: 'Level', value: user.level },
              user?.title && { label: 'Title', value: user.title },
              user?.departmentName && { label: 'Department', value: user.departmentName },
              user?.position && { label: 'Position', value: user.position },
              { label: 'Account active', value: user?.isActive ? 'yes' : 'no' },
              { label: 'Last sign in', value: date(user?.lastLoginAt, true) },
            ]}
          />
          <p className="mt-3 text-[0.8rem] text-ink-500">
            The password of this account is stored in <code>dbo.AppUser.PasswordHash</code> as a
            bcrypt hash. No table of the database holds a readable password.
          </p>
        </Card>

        <Card title="Change the password" subtitle="The new password needs 8 characters, a letter and a digit.">
          <form className="grid gap-3" onSubmit={submit}>
            <Field label="Current password">
              <input className="input" type="password" value={form.currentPassword} onChange={change('currentPassword')} required />
            </Field>
            <Field label="New password">
              <input className="input" type="password" value={form.newPassword} onChange={change('newPassword')} required minLength={8} />
            </Field>
            <Field label="Repeat the new password">
              <input className="input" type="password" value={form.confirmPassword} onChange={change('confirmPassword')} required minLength={8} />
            </Field>
            {error && <Note tone="danger">{error}</Note>}
            {message && <Note tone="success">{message}</Note>}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change the password'}</button>
          </form>
        </Card>
      </div>

      {user?.role === 'Student' && advisor && advisor.AdvisorName && (
        <div className="mt-4">
          <Card title="My academic advisor" subtitle="The person who signs a study plan and an overload request.">
            <KeyValue
              rows={[
                { label: 'Advisor', value: `${advisor.AdvisorTitle || ''} ${advisor.AdvisorName}` },
                { label: 'E-mail', value: advisor.AdvisorEmail },
                { label: 'Department', value: advisor.AdvisorDepartment || advisor.AdvisorProfile },
                { label: 'Office hours', value: advisor.AdvisorSlots },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}
