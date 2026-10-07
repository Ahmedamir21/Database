/**
 * Everything a teacher does inside one section, on one page with four tabs:
 *
 *   Roster and grades   enter a score per student (the trigger writes the letter and the points)
 *   Attendance          one session, one row per student, saved in one transaction
 *   Statistics          the numbers of the section, taken from the grades and the attendance
 *   Notices             a notice that only the students of this section see
 *
 * The API refuses every call on a section that does not belong to the signed in teacher, so
 * the tab that a teacher sees and the data that the database allows are the same thing.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api.js';
import {
  Badge, Card, Note, PageHeader, Progress, Select, Spinner, Stat, Table,
} from '../../components/ui.jsx';
import { date, labelOf, percent } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const TABS = [
  { key: 'grades', label: 'Roster and grades' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'notices', label: 'Notices' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

function GradeRow({ student, onSave, busy }) {
  const [score, setScore] = useState(student.Score ?? '');
  const dirty = String(score) !== String(student.Score ?? '');
  return (
    <tr>
      <td>{student.StudentNumber}</td>
      <td>{student.FullName}</td>
      <td className="text-[0.82rem] text-ink-500">{student.ProgramName}</td>
      <td className="text-right">{student.Sessions}</td>
      <td className="text-right">{student.Absences}</td>
      <td>
        <input
          className="input w-24 py-1 text-right" type="number" min="0" max="100" step="0.5"
          value={score} onChange={(event) => setScore(event.target.value)}
        />
      </td>
      <td>{student.LetterGrade ? <Badge tone="info">{student.LetterGrade}</Badge> : <span className="text-ink-400">—</span>}</td>
      <td>{student.GradePublished ? <Badge tone="success">published</Badge> : <Badge tone="warn">open</Badge>}</td>
      <td className="text-right">
        <button
          type="button" className="btn btn-primary px-2.5 py-1 text-[0.78rem]"
          disabled={!dirty || busy} onClick={() => onSave(student, score)}
        >
          save
        </button>
      </td>
    </tr>
  );
}

export default function SectionWorkspace() {
  const { sectionId } = useParams();
  const [tab, setTab] = useState('grades');
  const action = useAction();
  const section = useAsync(() => api.instructor.roster(sectionId), `section-${sectionId}`);
  const [sessionDate, setSessionDate] = useState(todayIso());

  const attendance = useAsync(
    () => api.instructor.attendance(sectionId, { date: sessionDate }),
    `attendance-${sectionId}-${sessionDate}`,
  );

  const statistics = useAsync(() => api.instructor.statistics(sectionId), `statistics-${sectionId}`);
  const notices = useAsync(() => api.instructor.announcements(sectionId), `notices-${sectionId}`);
  const [marks, setMarks] = useState({});
  const [notice, setNotice] = useState({ title: '', body: '', isPinned: false });

  const heading = useMemo(() => {
    const info = section.data?.section;
    if (!info) return 'Section';
    return `${info.Code} — ${info.Title} · section ${info.SectionCode}`;
  }, [section.data]);

  if (section.loading && !section.data) return <Spinner label="Loading the section…" />;
  if (section.error) return <Note tone="danger">{section.error}</Note>;

  const { rows, statistics: summary, attendance: attendanceSummary } = section.data;

  async function saveScore(student, score) {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      await action.exec(() => Promise.reject(new Error('A score is a number between 0 and 100.')));
      return;
    }
    await action.exec(() => api.instructor.setScore(sectionId, { enrollmentId: student.EnrollmentId, score: value }), {
      successMessage: `${student.FullName}: ${value} saved. The trigger wrote the letter and the grade points.`,
      onSuccess: () => { section.reload(); statistics.reload(); },
    });
  }

  async function publish() {
    if (!window.confirm('Publish the grades of this section? Every student without a score blocks the operation.')) return;
    await action.exec(() => api.instructor.publish(sectionId), {
      onSuccess: () => { section.reload(); statistics.reload(); },
    });
  }

  async function saveAttendance() {
    const entries = (attendance.data?.students || []).map((student) => ({
      enrollmentId: student.EnrollmentId,
      status: marks[student.EnrollmentId] || 'Present',
    }));
    await action.exec(
      () => api.instructor.saveAttendance(sectionId, { sessionDate, entries }),
      { onSuccess: () => { attendance.reload(); section.reload(); } },
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={<Link className="hover:underline" to="/teaching">my sections</Link>}
        title={heading}
        subtitle={`${rows.length} students on the roster`}
      />

      <div className="no-print mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key} type="button"
            className={`btn ${tab === item.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(action.error || action.message) && (
        <div className="mb-3 grid gap-2">
          {action.error && <Note tone="danger">{action.error}</Note>}
          {action.message && <Note tone="success" onClose={action.clear}>{action.message}</Note>}
        </div>
      )}

      {tab === 'grades' && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Students" value={rows.length} hint="registrations of this section" />
            <Stat label="Graded" value={summary?.Graded ?? 0} hint="with a published score" />
            <Stat label="Average" value={summary?.AverageScore ?? '—'} hint="of the published scores" />
            <Stat label="Pass rate" value={summary?.PassRate != null ? percent(summary.PassRate) : '—'} hint={`${summary?.Passed ?? 0} passed · ${summary?.Failed ?? 0} failed`} />
          </div>

          <Card
            title="Roster"
            subtitle="A score of 0 to 100. The letter grade and the grade points are written by the trigger TR_Enrollment_SetGrade."
            actions={<button type="button" className="btn btn-primary" onClick={publish} disabled={action.busy}>Publish the grades</button>}
            pad={false}
          >
            <div className="overflow-x-auto px-5 py-3">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th><th>Student</th><th>Program</th>
                    <th className="text-right">Sessions</th><th className="text-right">Absent</th>
                    <th>Score</th><th>Grade</th><th>State</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((student) => (
                    <GradeRow key={student.EnrollmentId} student={student} busy={action.busy} onSave={saveScore} />
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="py-6 text-center text-[0.9rem] text-ink-500">Nobody is registered in this section yet.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="grid gap-4">
          <Card
            title="One session"
            subtitle="Choose the date of the session, tick the students and save. The same date overwrites the previous entry (a MERGE statement)."
            actions={
              <div className="flex items-end gap-2">
                <label className="grid">
                  <span className="label">Session date</span>
                  <input className="input" type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
                </label>
                <Select
                  value=""
                  onChange={(event) => { if (event.target.value) setSessionDate(event.target.value); }}
                  placeholder="recorded sessions…"
                  options={(attendance.data?.dates || []).map((value) => ({ value, label: value }))}
                />
              </div>
            }
          >
            {attendance.loading ? <Spinner /> : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {['Present', 'Absent', 'Excused'].map((status) => (
                    <button
                      key={status} type="button" className="btn btn-ghost px-2.5 py-1 text-[0.8rem]"
                      onClick={() => setMarks(Object.fromEntries((attendance.data.students || []).map((student) => [student.EnrollmentId, status])))}
                    >
                      mark all {status}
                    </button>
                  ))}
                </div>
                <Table
                  columns={[
                    { key: 'StudentNumber', label: 'Number' },
                    { key: 'FullName', label: 'Student' },
                    {
                      key: 'status', label: 'Attendance', render: (student) => (
                        <div className="flex gap-2">
                          {['Present', 'Absent', 'Excused'].map((status) => {
                            const saved = (attendance.data.saved || []).find((row) => row.EnrollmentId === student.EnrollmentId);
                            const value = marks[student.EnrollmentId] || saved?.Status || 'Present';
                            return (
                              <label key={status} className={`cursor-pointer rounded-lg border px-2 py-0.5 text-[0.78rem] ${value === status ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-ink-200 text-ink-600'}`}>
                                <input
                                  type="radio" className="sr-only" name={`att-${student.EnrollmentId}`}
                                  checked={value === status}
                                  onChange={() => setMarks((current) => ({ ...current, [student.EnrollmentId]: status }))}
                                />
                                {status}
                              </label>
                            );
                          })}
                        </div>
                      ),
                    },
                    {
                      key: 'saved', label: 'On record', render: (student) => {
                        const saved = (attendance.data.saved || []).find((row) => row.EnrollmentId === student.EnrollmentId);
                        return saved ? <Badge tone={saved.Status === 'Present' ? 'success' : saved.Status === 'Excused' ? 'info' : 'danger'}>{saved.Status}</Badge> : <span className="text-ink-400">not saved</span>;
                      },
                    },
                  ]}
                  rows={attendance.data.students || []}
                  rowKey={(student) => student.EnrollmentId}
                  empty="Nobody is registered in this section."
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" className="btn btn-primary" onClick={saveAttendance} disabled={action.busy || !sessionDate}>
                    {action.busy ? 'Saving…' : `Save the attendance of ${sessionDate}`}
                  </button>
                </div>
              </>
            )}
          </Card>

          <Card title="Attendance of the section" subtitle="Read from the attendance rows of this section.">
            {attendanceSummary && (
              <div className="grid gap-4 sm:grid-cols-4">
                <Stat label="Sessions" value={attendanceSummary.Sessions ?? 0} />
                <Stat label="Present" value={attendanceSummary.Present ?? 0} />
                <Stat label="Absent" value={attendanceSummary.Absent ?? 0} />
                <Stat label="Rate" value={percent(attendanceSummary.AttendanceRate)} />
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'statistics' && (
        <div className="grid gap-4">
          {statistics.loading ? <Spinner /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Graded" value={statistics.data.statistics.Graded} />
                <Stat label="Average" value={statistics.data.statistics.AverageScore ?? '—'} />
                <Stat label="Lowest / highest" value={`${statistics.data.statistics.LowestScore ?? '—'} / ${statistics.data.statistics.HighestScore ?? '—'}`} />
                <Stat label="Pass rate" value={percent(statistics.data.statistics.PassRate)} hint={`${statistics.data.statistics.Passed} passed`} />
              </div>
              <Card title="Distribution of the letters" subtitle="Counted by the database from the published grades of this section.">
                <div className="grid gap-2">
                  {Object.entries(statistics.data.statistics)
                    .filter(([key]) => key.startsWith('Grade'))
                    .map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[110px_1fr_40px] items-center gap-3">
                        <span className="text-[0.85rem] text-ink-600">{labelOf(key).replace('Grade ', '')}</span>
                        <Progress value={statistics.data.statistics.Graded ? (value / statistics.data.statistics.Graded) * 100 : 0} />
                        <span className="text-right text-[0.85rem] tabular-nums">{value}</span>
                      </div>
                    ))}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'notices' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Card title="Post a notice to this section">
            <form
              className="grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                await action.exec(() => api.instructor.postAnnouncement(sectionId, notice), {
                  onSuccess: () => { setNotice({ title: '', body: '', isPinned: false }); notices.reload(); },
                });
              }}
            >
              <label className="grid"><span className="label">Title</span>
                <input className="input" value={notice.title} onChange={(event) => setNotice({ ...notice, title: event.target.value })} required minLength={3} />
              </label>
              <label className="grid"><span className="label">Text</span>
                <textarea className="input" rows="5" value={notice.body} onChange={(event) => setNotice({ ...notice, body: event.target.value })} required minLength={3} />
              </label>
              <label className="flex items-center gap-2 text-[0.88rem]">
                <input type="checkbox" checked={notice.isPinned} onChange={(event) => setNotice({ ...notice, isPinned: event.target.checked })} />
                Keep it at the top
              </label>
              <button className="btn btn-primary" type="submit" disabled={action.busy}>Post the notice</button>
            </form>
          </Card>

          <Card title="Notices of this section">
            {notices.loading ? <Spinner /> : (
              <ul className="grid gap-2">
                {(notices.data?.rows || []).map((row) => (
                  <li key={row.AnnouncementId} className="rounded-xl border border-ink-200 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.IsPinned && <Badge tone="gold">pinned</Badge>}
                      <span className="font-medium text-ink-800">{row.Title}</span>
                      <span className="text-[0.76rem] text-ink-500">{date(row.PostedAt, true)}</span>
                    </div>
                    <p className="mt-1 text-[0.88rem] text-ink-600">{row.Body}</p>
                  </li>
                ))}
                {(notices.data?.rows || []).length === 0 && <li className="text-[0.9rem] text-ink-500">No notice for this section yet.</li>}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
