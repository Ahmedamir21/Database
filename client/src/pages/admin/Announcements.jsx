/**
 * The board of the student office: an announcement written here is seen by every student of
 * the university (SectionId is NULL). A notice of one section is written by its teacher, from
 * the section workspace.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Spinner, Table } from '../../components/ui.jsx';
import { date } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const emptyNotice = { title: '', body: '', isPinned: false };

export default function AdminAnnouncements() {
  const action = useAction();
  const [form, setForm] = useState(emptyNotice);
  const { data, loading, error, reload } = useAsync(() => api.admin.announcements(), 'admin-notices');

  if (loading && !data) return <Spinner label="Loading the announcements…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { rows, stats } = data;

  return (
    <>
      <PageHeader title="Announcements" subtitle="Everything the students see on their dashboard." />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Card><p className="label">Notices</p><p className="text-[1.6rem] font-semibold tabular-nums">{stats.Total}</p></Card>
        <Card><p className="label">From the office</p><p className="text-[1.6rem] font-semibold tabular-nums">{stats.General}</p></Card>
        <Card><p className="label">From teachers</p><p className="text-[1.6rem] font-semibold tabular-nums">{stats.SectionNotices}</p></Card>
        <Card><p className="label">Pinned</p><p className="text-[1.6rem] font-semibold tabular-nums">{stats.Pinned}</p></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Title', label: 'Title' },
                { key: 'PostedAt', label: 'Posted', render: (row) => date(row.PostedAt, true) },
                { key: 'AuthorName', label: 'Author' },
                { key: 'Scope', label: 'Audience', render: (row) => (row.Scope === 'Everyone' ? <Badge tone="gold">everyone</Badge> : <Badge tone="info">{row.Scope}</Badge>) },
                { key: 'Views', label: 'Read', align: 'right' },
                { key: 'Pinned', label: '', render: (row) => (row.Pinned ? <Badge tone="success">pinned</Badge> : null) },
                {
                  key: 'action',
                  label: '',
                  render: (row) => (
                    <button
                      type="button" className="btn btn-danger px-2 py-1 text-[0.78rem]"
                      onClick={() => { if (window.confirm(`Delete “${row.Title}”?`)) action.exec(() => api.admin.deleteAnnouncement(row.AnnouncementId), { onSuccess: reload }); }}
                    >
                      delete
                    </button>
                  ),
                },
              ]}
              rows={rows}
              rowKey={(row) => row.AnnouncementId}
              empty="No announcement yet."
              dense
            />
          </div>
        </Card>

        <Card title="Write an announcement" subtitle="It appears on the dashboard of every active student.">
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await action.exec(() => api.admin.postAnnouncement(form), {
                onSuccess: () => { setForm(emptyNotice); reload(); },
              });
            }}
          >
            <Field label="Title">
              <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={3} />
            </Field>
            <Field label="Text">
              <textarea className="input" rows="6" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required minLength={3} />
            </Field>
            <label className="flex items-center gap-2 text-[0.88rem]">
              <input type="checkbox" checked={form.isPinned} onChange={(event) => setForm({ ...form, isPinned: event.target.checked })} />
              Pin it at the top of the dashboard
            </label>
            {action.error && <Note tone="danger">{action.error}</Note>}
            {action.message && <Note tone="success" onClose={action.clear}>{action.message}</Note>}
            <button className="btn btn-primary" type="submit" disabled={action.busy}>Publish</button>
          </form>
        </Card>
      </div>
    </>
  );
}
