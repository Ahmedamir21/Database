/**
 * The announcements page, with the menu of the role that is signed in.
 *
 *   a student  reads the global notices and the notices of the sections of their term
 *   a teacher  posts a notice for one of their own sections
 *   the office posts a notice for everybody, and removes the notices that are over
 */
import { useState } from 'react';
import api from '../../api.js';
import { useSession } from '../../App.jsx';
import { Badge, Card, Field, Note, PageHeader, Select, Spinner, Table } from '../../components/ui.jsx';
import { date, labelOf } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

function Audience() {
  return (
    <p className="text-[0.82rem] text-ink-500">
      The notices below are the global ones plus the notices of the sections you are registered in.
    </p>
  );
}

function StudentView() {
  const { data, loading, error } = useAsync(() => api.student.announcements(), 'student-announcements');
  if (loading) return <Spinner />;
  if (error) return <Note tone="danger">{error}</Note>;
  return (
    <>
      <Audience />
      <List rows={data.rows} />
    </>
  );
}

function List({ rows, onDelete }) {
  if (!rows.length) return <p className="py-6 text-center text-[0.9rem] text-ink-500">There is no announcement yet.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.AnnouncementId || row.Title} className="rounded-xl border border-ink-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {row.IsPinned && <Badge tone="gold">pinned</Badge>}
            <h3 className="font-medium text-ink-800">{row.Title}</h3>
            <span className="text-[0.78rem] text-ink-500">
              {row.CourseCode ? `${row.CourseCode} · ` : 'everybody · '}
              {row.AuthorName} ({row.AuthorRole}) · {date(row.PostedAt, true)}
            </span>
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger ml-auto px-2 py-1 text-[0.78rem]"
                onClick={() => onDelete(row)}
              >
                remove
              </button>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[0.9rem] text-ink-700">{row.Body}</p>
        </li>
      ))}
    </ul>
  );
}

function InstructorView() {
  const sections = useAsync(() => api.instructor.sections(), 'instructor-sections');
  const [sectionId, setSectionId] = useState('');
  const [form, setForm] = useState({ title: '', body: '', isPinned: false });
  const action = useAction();

  const chosen = sectionId || (sections.data?.rows?.[0]?.SectionId ?? '');
  const list = useAsync(
    () => (chosen ? api.instructor.announcements(chosen) : Promise.resolve({ rows: [] })),
    `section-announcements-${chosen}`,
  );

  if (sections.loading) return <Spinner />;
  if (sections.error) return <Note tone="danger">{sections.error}</Note>;

  const options = (sections.data?.rows || []).map((row) => ({
    value: row.SectionId,
    label: `${row.CourseCode} ${row.SectionCode} — ${row.SemesterName}`,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <Card title="Post a notice to one of my sections">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            action.exec(() => api.instructor.postAnnouncement(chosen, form), { onSuccess: () => list.reload() });
          }}
        >
          <Field label="Section">
            <Select value={chosen} onChange={(event) => setSectionId(event.target.value)} options={options} />
          </Field>
          <Field label="Title">
            <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={3} />
          </Field>
          <Field label="Text">
            <textarea className="input" rows="5" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required minLength={3} />
          </Field>
          <label className="flex items-center gap-2 text-[0.88rem]">
            <input type="checkbox" checked={form.isPinned} onChange={(event) => setForm({ ...form, isPinned: event.target.checked })} />
            Keep it at the top of the list
          </label>
          {action.error && <Note tone="danger">{action.error}</Note>}
          {action.message && <Note tone="success">{action.message}</Note>}
          <button className="btn btn-primary" type="submit" disabled={action.busy || !chosen}>
            {action.busy ? 'Posting…' : 'Post the notice'}
          </button>
        </form>
      </Card>

      <Card title="Notices of this section">
        {list.loading ? <Spinner /> : <List rows={list.data?.rows || []} />}
      </Card>
    </div>
  );
}

function OfficeView() {
  const list = useAsync(() => api.admin.announcements(), 'office-announcements');
  const [form, setForm] = useState({ title: '', body: '', isPinned: false });
  const action = useAction();

  if (list.loading) return <Spinner />;
  if (list.error) return <Note tone="danger">{list.error}</Note>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card title="Publish a notice for everybody">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            action.exec(() => api.admin.postAnnouncement(form), {
              onSuccess: () => { setForm({ title: '', body: '', isPinned: false }); list.reload(); },
            });
          }}
        >
          <Field label="Title">
            <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={3} />
          </Field>
          <Field label="Text">
            <textarea className="input" rows="5" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required minLength={3} />
          </Field>
          <label className="flex items-center gap-2 text-[0.88rem]">
            <input type="checkbox" checked={form.isPinned} onChange={(event) => setForm({ ...form, isPinned: event.target.checked })} />
            Pin it at the top of every student page
          </label>
          {action.error && <Note tone="danger">{action.error}</Note>}
          {action.message && <Note tone="success">{action.message}</Note>}
          <button className="btn btn-primary" type="submit" disabled={action.busy}>{action.busy ? 'Publishing…' : 'Publish'}</button>
        </form>
      </Card>

      <Card title="Every notice of the system" pad={false}>
        <div className="px-5 py-3">
          <Table
            columns={[
              { key: 'Title', label: 'Title' },
              { key: 'CourseCode', label: 'Scope', render: (row) => row.CourseCode || 'everybody' },
              { key: 'AuthorName', label: 'Author', render: (row) => `${row.AuthorName} (${row.AuthorRole})` },
              { key: 'PostedAt', label: 'Posted', render: (row) => date(row.PostedAt) },
              { key: 'actions', label: '', render: (row) => (
                <button
                  type="button"
                  className="btn btn-danger px-2 py-1 text-[0.78rem]"
                  onClick={() => action.exec(() => api.admin.deleteAnnouncement(row.AnnouncementId), { onSuccess: () => list.reload() })}
                >
                  remove
                </button>
              ) },
            ]}
            rows={list.data.rows}
            rowKey={(row) => row.AnnouncementId}
            empty="There is no announcement yet."
          />
          <p className="mt-2 text-[0.78rem] text-ink-500">{labelOf('Announcement')} counts: {list.data.rows.length}</p>
        </div>
      </Card>
    </div>
  );
}

export default function Announcements() {
  const { user } = useSession();
  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle={user?.role === 'Student' ? 'What the office and your teachers published.' : 'Notices of the term.'}
      />
      {user?.role === 'Student' && <StudentView />}
      {user?.role === 'Instructor' && <InstructorView />}
      {user?.role === 'Admin' && <OfficeView />}
    </>
  );
}
