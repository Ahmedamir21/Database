/**
 * Every student the signed in teacher has in any section, with the section they are in.
 * It is the list a teacher needs at the start of a term, and the list the office asks for
 * when a parent calls.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Card, Note, PageHeader, Spinner, Table } from '../../components/ui.jsx';
import { useAsync } from '../../lib/useAsync.js';

export default function MyStudents() {
  const [search, setSearch] = useState('');
  const { data, loading, error } = useAsync(() => api.instructor.students(), 'my-students');

  if (loading) return <Spinner label="Loading your students…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const rows = data.rows.filter((row) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return row.FullName.toLowerCase().includes(needle)
      || row.StudentNumber.includes(needle)
      || (row.ProgramName || '').toLowerCase().includes(needle);
  });

  return (
    <>
      <PageHeader
        title="My students"
        subtitle={`${data.rows.length} students in your sections`}
        actions={
          <input
            className="input w-64" placeholder="Search by name, number or program"
            value={search} onChange={(event) => setSearch(event.target.value)}
          />
        }
      />
      <Card pad={false}>
        <div className="px-5 py-3">
          <Table
            columns={[
              { key: 'StudentNumber', label: 'Number' },
              { key: 'FullName', label: 'Student' },
              { key: 'ProgramName', label: 'Program' },
              { key: 'Level', label: 'Level', align: 'right' },
              { key: 'Email', label: 'E-mail' },
            ]}
            rows={rows}
            rowKey={(row) => row.StudentNumber}
            empty="No student matches the search."
          />
        </div>
      </Card>
      <p className="mt-3 text-[0.8rem] text-ink-500">
        The query behind this page joins Section, Enrollment, Student, AppUser and Program and
        filters on <code>Section.InstructorId = @InstructorId</code>, so a teacher can never see
        a student of another section here.
      </p>
    </>
  );
}
