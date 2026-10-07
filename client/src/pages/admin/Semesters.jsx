/**
 * The semesters, and the one switch the whole application depends on: RegistrationOpen.
 *
 * The procedure sp_RegisterStudent refuses every registration when the window of the term is
 * closed or when its deadline has passed, so this page is the place where a term starts and
 * ends. Opening one term closes the others in the same transaction, because two open terms
 * would make "the current term" ambiguous.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Spinner, Table } from '../../components/ui.jsx';
import { date } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const emptyTerm = { name: '', startDate: '', endDate: '', registrationOpen: true, registrationDeadline: '', dropDeadline: '' };

export default function Semesters() {
  const action = useAction();
  const { data, loading, error, reload } = useAsync(() => api.admin.semesters(), 'semesters');
  const [form, setForm] = useState(emptyTerm);

  if (loading && !data) return <Spinner label="Loading the semesters…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  return (
    <>
      <PageHeader title="Semesters" subtitle="The registration window of every term of the project." />

      {action.error && <div className="mb-3"><Note tone="danger">{action.error}</Note></div>}
      {action.message && <div className="mb-3"><Note tone="success" onClose={action.clear}>{action.message}</Note></div>}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Name', label: 'Term' },
                { key: 'StartDate', label: 'From', render: (row) => date(row.StartDate) },
                { key: 'EndDate', label: 'To', render: (row) => date(row.EndDate) },
                { key: 'RegistrationDeadline', label: 'Registration until', render: (row) => date(row.RegistrationDeadline) },
                { key: 'DropDeadline', label: 'Drop until', render: (row) => date(row.DropDeadline) },
                { key: 'Sections', label: 'Sections', align: 'right' },
                { key: 'Enrollments', label: 'Registrations', align: 'right' },
                { key: 'RegistrationOpen', label: 'Window', render: (row) => (row.RegistrationOpen ? <Badge tone="success">open</Badge> : <Badge tone="neutral">closed</Badge>) },
                {
                  key: 'action',
                  label: '',
                  render: (row) => (
                    <button
                      type="button"
                      className={`btn px-2 py-1 text-[0.78rem] ${row.RegistrationOpen ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => action.exec(
                        () => api.admin.updateSemester(row.SemesterId, { registrationOpen: !row.RegistrationOpen }),
                        { onSuccess: reload },
                      )}
                    >
                      {row.RegistrationOpen ? 'close' : 'open'}
                    </button>
                  ),
                },
              ]}
              rows={data.rows}
              rowKey={(row) => row.SemesterId}
              empty="There is no semester yet."
              dense
            />
          </div>
        </Card>

        <Card title="Plan another term">
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await action.exec(() => api.admin.createSemester(form), {
                onSuccess: () => { setForm(emptyTerm); reload(); },
              });
            }}
          >
            <Field label="Name" hint="For example: Spring 2027">
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={3} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts">
                <input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required />
              </Field>
              <Field label="Ends">
                <input className="input" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required />
              </Field>
              <Field label="Registration deadline">
                <input className="input" type="date" value={form.registrationDeadline} onChange={(event) => setForm({ ...form, registrationDeadline: event.target.value })} />
              </Field>
              <Field label="Drop deadline">
                <input className="input" type="date" value={form.dropDeadline} onChange={(event) => setForm({ ...form, dropDeadline: event.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[0.88rem]">
              <input type="checkbox" checked={form.registrationOpen} onChange={(event) => setForm({ ...form, registrationOpen: event.target.checked })} />
              Open the registration of this term (and close the others)
            </label>
            <button className="btn btn-primary" type="submit" disabled={action.busy}>{action.busy ? 'Planning…' : 'Plan the term'}</button>
            <p className="text-[0.78rem] text-ink-500">
              The database keeps the rule in <code>CK_Semester_Dates</code> (the term has to end
              after it starts) and in the checks of the two deadlines.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
