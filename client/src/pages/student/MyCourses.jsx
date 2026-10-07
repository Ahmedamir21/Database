/**
 * The courses of one term, with the weekly timetable drawn from the same rows.
 *
 * Dropping a course is a full operation of the system, not a delete: the button calls
 * sp_DropEnrollment, which checks the drop deadline and the status of the registration, and
 * the row keeps its place in the history with the status Dropped.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Note, PageHeader, Select, Spinner, Table } from '../../components/ui.jsx';
import { dayName, timeRange, gradeTone, statusTone } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const DAYS = [1, 2, 3, 4, 5];

function slotsFrom(rows) {
  const marks = new Set();
  rows.forEach((row) => {
    const start = Number(String(row.StartTime).slice(0, 2)) * 60 + Number(String(row.StartTime).slice(3, 5));
    const end = Number(String(row.EndTime).slice(0, 2)) * 60 + Number(String(row.EndTime).slice(3, 5));
    for (let mark = start; mark < end; mark += 30) marks.add(mark);
  });
  return [...marks].sort((a, b) => a - b);
}

const toLabel = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (value) => Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3, 5));

function WeeklyTimetable({ rows }) {
  const active = rows.filter((row) => row.Status === 'Enrolled');
  if (!active.length) return <p className="text-[0.88rem] text-ink-500">No active registration in this term.</p>;

  const marks = slotsFrom(active);
  if (!marks.length) return <p className="text-[0.88rem] text-ink-500">The sections of this term have no time slot yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[640px]">
        <thead>
          <tr>
            <th className="w-16">Time</th>
            {DAYS.map((day) => <th key={day}>{dayName(day)}</th>)}
          </tr>
        </thead>
        <tbody>
          {marks.map((mark) => (
            <tr key={mark}>
              <td className="whitespace-nowrap text-[0.78rem] text-ink-500">{toLabel(mark)}</td>
              {DAYS.map((day) => {
                const cell = active.find((row) => (
                  row.DayOfWeek === day && toMinutes(row.StartTime) <= mark && toMinutes(row.EndTime) > mark
                ));
                const isStart = cell && toMinutes(cell.StartTime) === mark;
                return (
                  <td key={day} className={cell ? 'bg-brand-50/70' : ''}>
                    {isStart && (
                      <div className="leading-tight">
                        <span className="block text-[0.84rem] font-semibold text-brand-700">{cell.Code}</span>
                        <span className="block text-[0.74rem] text-ink-500">{cell.SectionCode} · {cell.RoomName}</span>
                      </div>
                    )}
                    {cell && !isStart && <span className="text-[0.74rem] text-brand-600">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MyCourses() {
  const [semesterId, setSemesterId] = useState('');
  const action = useAction();
  const semesters = useAsync(() => api.semesters(), 'semesters-list');
  const { data, loading, error, reload } = useAsync(
    () => api.student.courses(semesterId ? { semesterId } : {}),
    `my-courses-${semesterId}`,
  );

  if (loading && !data) return <Spinner label="Loading your courses…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { term, rows, load } = data;

  return (
    <>
      <PageHeader
        breadcrumb={term.Name}
        title="My courses"
        subtitle={`${rows.length} registrations · ${load.CreditHours} credit hours of this term`}
        actions={
          <div className="w-56">
            <Select
              value={semesterId || term.SemesterId}
              onChange={(event) => setSemesterId(event.target.value)}
              options={(semesters.data?.rows || []).map((row) => ({ value: row.SemesterId, label: row.Name }))}
            />
          </div>
        }
      />

      {action.error && <div className="mb-3"><Note tone="danger">{action.error}</Note></div>}
      {action.message && <div className="mb-3"><Note tone="success" onClose={action.clear}>{action.message}</Note></div>}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Registrations" pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Code', label: 'Course' },
                { key: 'Title', label: 'Title' },
                { key: 'CreditHours', label: 'Cr', align: 'right' },
                { key: 'slot', label: 'When', render: (row) => `${dayName(row.DayOfWeek)} ${timeRange(row.StartTime, row.EndTime)}` },
                { key: 'InstructorName', label: 'Teacher' },
                { key: 'Status', label: 'Status', render: (row) => <Badge tone={statusTone(row.Status)}>{row.Status}</Badge> },
                {
                  key: 'grade',
                  label: 'Grade',
                  render: (row) => (row.published && row.LetterGrade
                    ? <Badge tone={gradeTone(row.LetterGrade)}>{row.LetterGrade} · {row.Score}</Badge>
                    : <span className="text-[0.8rem] text-ink-400">not published</span>),
                },
                {
                  key: 'action',
                  label: '',
                  render: (row) => (row.Status === 'Enrolled' ? (
                    <button
                      type="button"
                      className="btn btn-danger px-2 py-1 text-[0.78rem]"
                      onClick={() => {
                        if (!window.confirm(`Drop ${row.Code}? The registration keeps its place in the history with the status Dropped.`)) return;
                        action.exec(() => api.student.drop(row.EnrollmentId), { onSuccess: () => reload() });
                      }}
                    >
                      drop
                    </button>
                  ) : null),
                },
              ]}
              rows={rows}
              rowKey={(row) => row.EnrollmentId}
              empty="There is no registration in this term."
            />
          </div>
        </Card>

        <Card title="The week of this term" subtitle="Drawn from the same registrations as the table.">
          <WeeklyTimetable rows={rows} />
        </Card>
      </div>

      <p className="mt-3 text-[0.8rem] text-ink-500">
        A dropped course is not deleted: <code>sp_DropEnrollment</code> sets the status to
        Dropped, clears the score and refuses when the drop deadline of the term has passed.
      </p>
    </>
  );
}
