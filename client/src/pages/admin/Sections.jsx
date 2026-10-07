/**
 * The sections of a term.
 *
 * Two rules are enforced here and shown to the user before anything goes to the database:
 *   · a room or a teacher cannot be in two places at the same moment — the API refuses a
 *     section whose slot is already taken (409 with the name of the section in the way);
 *   · a section that already has registrations is never deleted: the message of the API says
 *     how many registrations there are and asks to close the section instead.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Progress, Select, Spinner, Table } from '../../components/ui.jsx';
import { dayName } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const emptySection = {
  courseId: '', semesterId: '', instructorId: '', roomId: '', sectionCode: '01',
  capacity: 35, dayOfWeek: 1, startTime: '09:00', endTime: '10:30',
};

const DAYS = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ value: day, label: dayName(day) }));

export default function Sections() {
  const [semesterId, setSemesterId] = useState('');
  const [form, setForm] = useState(emptySection);
  const action = useAction();

  const { data, loading, error, reload } = useAsync(() => api.admin.sections({ semesterId }), `sections-${semesterId}`);

  if (loading && !data) return <Spinner label="Loading the sections…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const semesters = (data.semesters || []).map((row) => ({ value: row.SemesterId, label: `${row.Name}${row.RegistrationOpen ? ' (open)' : ''}` }));
  const courses = (data.courses || []).map((row) => ({ value: row.CourseId, label: `${row.Code} — ${row.Title}` }));
  const instructors = (data.instructors || []).map((row) => ({ value: row.UserId, label: `${row.Title || ''} ${row.FullName} (${row.DepartmentCode})` }));
  const rooms = (data.rooms || []).map((row) => ({ value: row.RoomId, label: `${row.Building} ${row.RoomNumber} · ${row.Capacity} seats · ${row.RoomType}` }));

  return (
    <>
      <PageHeader
        title="Sections"
        subtitle={`${data.rows.length} sections with these filters`}
        actions={
          <div className="w-56">
            <Select value={semesterId} onChange={(event) => setSemesterId(event.target.value)} placeholder="All semesters" options={semesters} />
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'CourseCode', label: 'Course' },
                { key: 'SectionCode', label: 'Sec' },
                { key: 'SemesterName', label: 'Term' },
                { key: 'InstructorName', label: 'Teacher' },
                { key: 'RoomName', label: 'Room' },
                { key: 'Enrolled', label: 'Seats', align: 'right', render: (row) => `${row.Enrolled} / ${row.Capacity}` },
                {
                  key: 'fill',
                  label: 'Fill',
                  render: (row) => (
                    <div className="min-w-[96px]">
                      <Progress value={row.FillPercent} tone={row.FillPercent >= 100 ? 'danger' : row.FillPercent >= 80 ? 'warn' : 'success'} />
                      <span className="text-[0.74rem] text-ink-500">{row.FillPercent}%</span>
                    </div>
                  ),
                },
                { key: 'isFull', label: '', render: (row) => (row.isFull ? <Badge tone="danger">full</Badge> : null) },
                {
                  key: 'action',
                  label: '',
                  render: (row) => (
                    <button
                      type="button"
                      className="btn btn-danger px-2 py-1 text-[0.78rem]"
                      onClick={() => {
                        if (!window.confirm(`Delete section ${row.CourseCode} ${row.SectionCode}?`)) return;
                        action.exec(() => api.admin.deleteSection(row.SectionId), { onSuccess: reload });
                      }}
                    >
                      delete
                    </button>
                  ),
                },
              ]}
              rows={data.rows}
              rowKey={(row) => row.SectionId}
              empty="No section with these filters."
            />
          </div>
        </Card>

        <Card title="Open a new section" subtitle="The API checks the room and the teacher for the same slot before it inserts.">
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await action.exec(() => api.admin.createSection(form), {
                onSuccess: () => { setForm({ ...emptySection }); reload(); },
              });
            }}
          >
            <Field label="Course">
              <Select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })} options={courses} placeholder="Choose a course" />
            </Field>
            <Field label="Semester">
              <Select value={form.semesterId} onChange={(event) => setForm({ ...form, semesterId: event.target.value })} options={semesters} placeholder="Choose a semester" />
            </Field>
            <Field label="Instructor">
              <Select value={form.instructorId} onChange={(event) => setForm({ ...form, instructorId: event.target.value })} options={instructors} placeholder="Choose an instructor" />
            </Field>
            <Field label="Room">
              <Select value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })} options={rooms} placeholder="Choose a room" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Section">
                <input className="input" value={form.sectionCode} onChange={(event) => setForm({ ...form, sectionCode: event.target.value })} />
              </Field>
              <Field label="Seats">
                <input className="input" type="number" min="5" max="500" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
              </Field>
              <Field label="Day">
                <Select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })} options={DAYS} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">
                <input className="input" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
              </Field>
              <Field label="To">
                <input className="input" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
              </Field>
            </div>
            {action.error && <Note tone="danger">{action.error}</Note>}
            {action.message && <Note tone="success" onClose={action.clear}>{action.message}</Note>}
            <button className="btn btn-primary" type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Open the section'}</button>
          </form>
        </Card>
      </div>
    </>
  );
}
