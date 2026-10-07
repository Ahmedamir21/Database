/**
 * The course catalogue of the office: what the university offers, with the number of sections
 * each course already has and the number of its prerequisites. A new course is created here;
 * a course that courses were never opened for can still be added to a term on the Sections page.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Select, Spinner, Table } from '../../components/ui.jsx';
import { useAction, useAsync } from '../../lib/useAsync.js';

const emptyCourse = { code: '', title: '', creditHours: 3, level: 1, departmentId: '', description: '' };

export default function CourseCatalogue() {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyCourse);
  const action = useAction();
  const { data, loading, error, reload } = useAsync(() => api.admin.catalogue({ search }), `catalogue-${search}`);

  if (loading && !data) return <Spinner label="Loading the catalogue…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const departments = (data.departments || []).map((row) => ({ value: row.DepartmentId, label: `${row.Code} — ${row.Name}` }));

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={`${data.rows.length} courses in the catalogue`}
        actions={<input className="input w-64" placeholder="Search code or title" value={search} onChange={(event) => setSearch(event.target.value)} />}
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Code', label: 'Code' },
                { key: 'Title', label: 'Title' },
                { key: 'CreditHours', label: 'Cr', align: 'right' },
                { key: 'Level', label: 'Level', align: 'right' },
                { key: 'DepartmentCode', label: 'Department' },
                { key: 'SectionCount', label: 'Sections', align: 'right' },
                { key: 'PrerequisiteCount', label: 'Prereq.', align: 'right', render: (row) => (row.PrerequisiteCount > 0 ? <Badge tone="info">{row.PrerequisiteCount}</Badge> : '—') },
              ]}
              rows={data.rows}
              rowKey={(row) => row.CourseId}
              empty="No course matches the search."
            />
          </div>
        </Card>

        <Card title="Add a course" subtitle="The code looks like CS301: two to four letters and three digits.">
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await action.exec(() => api.admin.createCourse(form), {
                onSuccess: () => { setForm(emptyCourse); reload(); },
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code">
                <input className="input uppercase" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="CS405" required />
              </Field>
              <Field label="Credit hours">
                <input className="input" type="number" min="1" max="6" value={form.creditHours} onChange={(event) => setForm({ ...form, creditHours: event.target.value })} required />
              </Field>
            </div>
            <Field label="Title">
              <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Distributed Systems" required minLength={3} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department">
                <Select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} options={departments} placeholder="Choose a department" />
              </Field>
              <Field label="Level">
                <Select
                  value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}
                  options={[1, 2, 3, 4, 5].map((level) => ({ value: level, label: `Level ${level}` }))}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            {action.error && <Note tone="danger">{action.error}</Note>}
            {action.message && <Note tone="success" onClose={action.clear}>{action.message}</Note>}
            <button className="btn btn-primary" type="submit" disabled={action.busy}>{action.busy ? 'Adding…' : 'Add the course'}</button>
          </form>
        </Card>
      </div>
    </>
  );
}
