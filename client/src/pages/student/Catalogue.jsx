/**
 * Registration: the catalogue of the open term with the seats that are left, and the button
 * that registers the student in a section.
 *
 * The button asks the API first ("may I take this section?") and shows the answer of the
 * database rule by rule; the registration itself runs inside sp_RegisterStudent, which checks
 * the same rules again, with the section row locked so that two students cannot take the last
 * seat at the same moment.
 */
import { useState } from 'react';
import api from '../../api.js';
import { useSession } from '../../App.jsx';
import {
  Badge, Card, Field, Note, PageHeader, Progress, Select, Spinner, Table,
} from '../../components/ui.jsx';
import { date, dayName, timeRange } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const LEVELS = [1, 2, 3, 4, 5].map((level) => ({ value: level, label: `Level ${level}` }));

export default function Catalogue() {
  const { user } = useSession();
  const [filters, setFilters] = useState({ search: '', departmentId: '', level: '' });
  const [pending, setPending] = useState(null);
  const action = useAction();

  const departments = useAsync(() => api.departments(), 'departments');
  const { data, loading, error, reload } = useAsync(
    () => api.student.catalogue(filters),
    `catalogue-${filters.search}|${filters.departmentId}|${filters.level}`,
  );

  async function register(row) {
    setPending(row.SectionId);
    const answer = await action.exec(() => api.student.register(row.SectionId), { onSuccess: () => reload() });
    setPending(null);
    return answer;
  }

  async function check(row) {
    setPending(row.SectionId);
    try {
      const answer = await api.student.eligibility(row.SectionId);
      action.clear();
      setPending(null);
      return answer;
    } catch (requestError) {
      setPending(null);
      return { problems: [{ rule: '—', message: requestError.message }], canRegister: false };
    }
  }

  if (loading && !data) return <Spinner label="Loading the catalogue…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const term = data.term;
  const rows = data.rows;
  const open = rows.filter((row) => row.canRegister).length;

  return (
    <>
      <PageHeader
        breadcrumb={`${term.Name} · registration ${term.RegistrationOpen ? 'open' : 'closed'} until ${date(term.RegistrationDeadline)}`}
        title="Registration"
        subtitle={`${rows.length} sections offered · ${open} of them open to ${user?.fullName}`}
        actions={<button type="button" className="btn btn-ghost" onClick={reload}>Refresh the seats</button>}
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Search" className="sm:col-span-2">
            <input
              className="input" value={filters.search} placeholder="Code or title, e.g. CS301 or database"
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </Field>
          <Field label="Department">
            <Select
              value={filters.departmentId}
              onChange={(event) => setFilters({ ...filters, departmentId: event.target.value })}
              placeholder="All departments"
              options={(departments.data?.rows || []).map((row) => ({ value: row.Code, label: `${row.Code} — ${row.Name}` }))}
            />
          </Field>
          <Field label="Level">
            <Select
              value={filters.level}
              onChange={(event) => setFilters({ ...filters, level: event.target.value })}
              placeholder="All levels"
              options={LEVELS}
            />
          </Field>
        </div>
        {action.error && <div className="mt-3"><Note tone="danger">{action.error}</Note></div>}
        {action.message && <div className="mt-3"><Note tone="success" onClose={action.clear}>{action.message}</Note></div>}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-3">
          <Table
            columns={[
              { key: 'Code', label: 'Course' },
              { key: 'Title', label: 'Title' },
              { key: 'CreditHours', label: 'Cr', align: 'right' },
              { key: 'SectionCode', label: 'Sec' },
              { key: 'InstructorName', label: 'Teacher' },
              { key: 'slot', label: 'When', render: (row) => `${dayName(row.DayOfWeek)} ${timeRange(row.StartTime, row.EndTime)}` },
              { key: 'RoomName', label: 'Room' },
              {
                key: 'seats',
                label: 'Seats',
                render: (row) => (
                  <div className="min-w-[92px]">
                    <div className="flex items-center justify-between text-[0.8rem]">
                      <span className={row.SeatsLeft <= 0 ? 'font-semibold text-danger-500' : 'text-ink-600'}>
                        {row.SeatsLeft > 0 ? `${row.SeatsLeft} left` : 'full'}
                      </span>
                      <span className="text-ink-400">/{row.Capacity}</span>
                    </div>
                    <Progress
                      value={((row.Capacity - row.SeatsLeft) / row.Capacity) * 100}
                      tone={row.SeatsLeft <= 0 ? 'danger' : row.SeatsLeft < 5 ? 'warn' : 'success'}
                    />
                  </div>
                ),
              },
              {
                key: 'rules',
                label: 'Rules',
                render: (row) => (
                  row.AlreadyRegistered === 1
                    ? <Badge tone="info">already registered</Badge>
                    : row.PrerequisitesMet === 1
                      ? <Badge tone="success">prerequisites ok</Badge>
                      : <Badge tone="warn">prerequisite missing</Badge>
                ),
              },
              {
                key: 'action',
                label: '',
                render: (row) => (
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-[0.78rem]"
                      onClick={async () => {
                        const answer = await check(row);
                        action.clear();
                        window.alert(
                          answer.canRegister
                            ? `${row.Code}: you can register in this section.`
                            : `${row.Code}: the database would refuse it.\n\n${answer.problems.map((problem) => `${problem.rule}: ${problem.message}`).join('\n')}`,
                        );
                      }}
                      disabled={pending === row.SectionId}
                    >
                      check
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary px-2.5 py-1 text-[0.78rem]"
                      disabled={!row.canRegister || pending === row.SectionId}
                      title={row.blockedReason || 'Register in this section'}
                      onClick={() => register(row)}
                    >
                      {pending === row.SectionId ? '…' : 'register'}
                    </button>
                  </div>
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.SectionId}
            empty="No section matches the filters."
          />
        </div>
      </Card>

      <p className="mt-3 text-[0.8rem] text-ink-500">
        The registration runs inside the stored procedure <code>sp_RegisterStudent</code>. It
        enforces R1 (the window is open), R2 (the account is active), R3 (the prerequisites are
        passed), R4 (a free seat), R5 (no clash), R6 (not taken twice) and R7 (at most 18 credit
        hours). When it refuses, the sentence of the database is shown here unchanged.
      </p>
    </>
  );
}
