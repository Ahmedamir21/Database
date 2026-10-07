/**
 * The office dashboard: the numbers of the term, the sections that are full, and the size of
 * the database. It is the page the head of the student office keeps open.
 */
import { Link } from 'react-router-dom';
import api from '../../api.js';
import { Card, Note, PageHeader, Progress, Spinner, Stat, Table } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

export default function OfficeOverview() {
  const { data, loading, error } = useAsync(() => api.admin.overview(), 'admin-overview');

  if (loading) return <Spinner label="Loading the office dashboard…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { numbers, board, tableCounts } = data;
  const bigTables = tableCounts.slice(0, 6);

  return (
    <>
      <PageHeader
        breadcrumb="student office"
        title="Overview"
        subtitle="The state of the term, and the size of the project database."
        actions={<>
          <Link className="btn btn-ghost" to="/office/payments">Payments</Link>
          <Link className="btn btn-primary" to="/reports">Reports</Link>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={numbers.ActiveStudents} hint="IsActive = 1" />
        <Stat label="Sections this term" value={numbers.SectionsThisSemester} hint={`${numbers.EnrollmentsThisSemester} registrations`} />
        <Stat label="Instructors waiting" value={numbers.PendingInstructors} hint="accounts to approve" tone={numbers.PendingInstructors > 0 ? 'gold' : 'brand'} />
        <Stat label="Collected all time" value={money(numbers.CollectedTotal).replace(' EGP', '')} hint="every payment on record" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="How full the sections of this term are"
          subtitle={`${numbers.FullSections} sections are full`}
          actions={<Link className="btn btn-ghost" to="/office/sections">Manage the sections</Link>}
          pad={false}
        >
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'CourseCode', label: 'Course' },
                { key: 'CourseTitle', label: 'Title' },
                { key: 'SectionCode', label: 'Sec' },
                { key: 'InstructorName', label: 'Teacher' },
                { key: 'Enrolled', label: 'Seats', align: 'right', render: (row) => `${row.Enrolled} / ${row.Capacity}` },
                {
                  key: 'FillPercent',
                  label: 'Fill',
                  render: (row) => (
                    <div className="min-w-[110px]">
                      <div className="text-[0.8rem]">{row.FillPercent}%</div>
                      <Progress value={row.FillPercent} tone={row.FillPercent >= 100 ? 'danger' : row.FillPercent >= 80 ? 'warn' : 'success'} />
                    </div>
                  ),
                },
              ]}
              rows={board}
              rowKey={(row) => row.SectionId}
              empty="No section in this term."
              dense
            />
          </div>
        </Card>

        <div className="grid gap-4">
          <Card title="The database in numbers" subtitle="SELECT COUNT(*) on the tables of the project." pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'TableName', label: 'Table' },
                  { key: 'Rows', label: 'Rows', align: 'right' },
                ]}
                rows={bigTables}
                rowKey={(row) => row.TableName}
                dense
              />
              <div className="mt-2"><Link className="text-[0.86rem] font-semibold text-brand-600 hover:underline" to="/office/database">All tables and objects →</Link></div>
            </div>
          </Card>

          <Card title="What the office does from here">
            <ul className="grid gap-2 text-[0.9rem] text-ink-700">
              <li>· Approve a new instructor account on <Link className="text-brand-600 hover:underline" to="/office/users">Users</Link>.</li>
              <li>· Add a course or a section for the term on <Link className="text-brand-600 hover:underline" to="/office/catalogue">Courses</Link> and <Link className="text-brand-600 hover:underline" to="/office/sections">Sections</Link>.</li>
              <li>· Open or close the registration window on <Link className="text-brand-600 hover:underline" to="/office/semesters">Semesters</Link>.</li>
              <li>· Record a payment, with a receipt, on <Link className="text-brand-600 hover:underline" to="/office/payments">Payments</Link>.</li>
              <li>· Read the statistical, detailed and managerial reports on <Link className="text-brand-600 hover:underline" to="/reports">Reports</Link>.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
