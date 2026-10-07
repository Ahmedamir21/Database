/**
 * The accounts of the system.
 *
 * Two rules of the project live on this page:
 *   · only the FIRST administrator is created outside the application, every further one is
 *     created here by an administrator (the form at the right);
 *   · an account is switched off, never deleted, so that the history of the records stays
 *     readable. The API refuses to switch off the last administrator.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Select, Spinner, Table } from '../../components/ui.jsx';
import { date } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const ROLES = [
  { value: 'Student', label: 'Students' },
  { value: 'Instructor', label: 'Instructors' },
  { value: 'Admin', label: 'Administrators' },
];

const emptyAdmin = { fullName: '', email: '', position: 'Student Records Officer', password: '', confirmPassword: '', canRecordPayments: true };

export default function Users() {
  const [filters, setFilters] = useState({ role: '', status: '', search: '' });
  const action = useAction();
  const [form, setForm] = useState(emptyAdmin);

  const { data, loading, error, reload } = useAsync(
    () => api.admin.users(filters),
    `users-${filters.role}|${filters.status}|${filters.search}`,
  );

  if (loading && !data) return <Spinner label="Loading the accounts…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const rows = data.rows;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${rows.length} accounts with these filters`}
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Role">
                <Select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} placeholder="All roles" options={ROLES} />
              </Field>
              <Field label="State">
                <Select
                  value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                  placeholder="Active and waiting"
                  options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Waiting for approval' }]}
                />
              </Field>
              <Field label="Search">
                <input className="input" value={filters.search} placeholder="Name, e-mail or student number" onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
              </Field>
            </div>
            {action.error && <div className="mt-3"><Note tone="danger">{action.error}</Note></div>}
            {action.message && <div className="mt-3"><Note tone="success" onClose={action.clear}>{action.message}</Note></div>}
          </Card>

          <Card pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'FullName', label: 'Name' },
                  { key: 'Email', label: 'E-mail' },
                  { key: 'Role', label: 'Role', render: (row) => <Badge tone={row.Role === 'Admin' ? 'gold' : row.Role === 'Instructor' ? 'info' : 'neutral'}>{row.Role}</Badge> },
                  {
                    key: 'detail',
                    label: 'Detail',
                    render: (row) => row.StudentNumber
                      ? `${row.StudentNumber} · ${row.ProgramName} · level ${row.Level}`
                      : row.Title ? `${row.Title} · ${row.DepartmentName}` : (row.Position || '—'),
                  },
                  { key: 'LastLoginAt', label: 'Last sign in', render: (row) => (row.LastLoginAt ? date(row.LastLoginAt, true) : 'never') },
                  { key: 'IsActive', label: 'State', render: (row) => (row.IsActive ? <Badge tone="success">active</Badge> : <Badge tone="warn">waiting</Badge>) },
                  {
                    key: 'action',
                    label: '',
                    render: (row) => (
                      <button
                        type="button"
                        className={`btn px-2 py-1 text-[0.78rem] ${row.IsActive ? 'btn-danger' : 'btn-primary'}`}
                        onClick={() => action.exec(() => api.admin.setActive(row.UserId, !row.IsActive), { onSuccess: reload })}
                      >
                        {row.IsActive ? 'switch off' : 'approve'}
                      </button>
                    ),
                  },
                ]}
                rows={rows}
                rowKey={(row) => row.UserId}
                empty="No account matches the filters."
              />
            </div>
          </Card>
        </div>

        <Card title="Create another administrator" subtitle="The first one was created with npm run seed:admin; this form creates the following ones.">
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await action.exec(() => api.admin.createAdmin(form), {
                onSuccess: () => { setForm(emptyAdmin); reload(); },
              });
            }}
          >
            <Field label="Full name">
              <input className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required minLength={3} />
            </Field>
            <Field label="University e-mail">
              <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </Field>
            <Field label="Position">
              <input className="input" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} required />
            </Field>
            <Field label="Password" hint="8 characters or more, with a letter and a digit.">
              <input className="input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} />
            </Field>
            <Field label="Repeat the password">
              <input className="input" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required minLength={8} />
            </Field>
            <label className="flex items-center gap-2 text-[0.88rem]">
              <input type="checkbox" checked={form.canRecordPayments} onChange={(event) => setForm({ ...form, canRecordPayments: event.target.checked })} />
              This administrator may record payments
            </label>
            <button className="btn btn-primary" type="submit" disabled={action.busy}>
              {action.busy ? 'Creating…' : 'Create the administrator'}
            </button>
            <p className="text-[0.78rem] text-ink-500">
              The password is hashed with bcrypt in the API before it reaches the database, so the
              table <code>dbo.AppUser</code> only ever holds a hash.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
