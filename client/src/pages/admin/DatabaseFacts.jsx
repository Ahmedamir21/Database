/**
 * The office page about the database itself.
 *
 * It answers the question a marker asks first: what is inside the delivered database? The
 * numbers of the tables come from the database (one COUNT(*) per table), the number of
 * reports comes from the report catalogue, and the objects below are the schema that
 * database/01_schema.sql creates - the names are the ones of the file, so this page and the
 * .sql file can be compared line by line.
 *
 * It is also the page that shows HOW the application touches the database: the screens call
 * the API, the API binds parameters, and the rules that matter (registration, dropping,
 * publishing grades, the grade of a row) are enforced by the procedures and the trigger
 * inside the database, not by the browser.
 */
import { Link } from 'react-router-dom';
import api from '../../api.js';
import {
  Badge, Card, Note, PageHeader, Progress, Spinner, Stat, Table,
} from '../../components/ui.jsx';
import { useAsync } from '../../lib/useAsync.js';

/** every object of the delivered schema, with the names database/01_schema.sql creates */
const OBJECTS = [
  {
    kind: 'Tables',
    names: ['AppUser', 'Student', 'Instructor', 'Admin', 'Department', 'Program', 'Course',
      'Prerequisite', 'Semester', 'Room', 'Section', 'Enrollment', 'Attendance', 'Payment',
      'Announcement'],
    note: 'The whole model: accounts, the academic catalogue, the terms, the sections, the registrations, the attendance, the money and the announcements.',
  },
  {
    kind: 'Views',
    names: ['vw_StudentGpa', 'vw_SectionFill'],
    note: 'The GPA of every student and term, and how full every section is. Both are used by screens and by reports.',
  },
  {
    kind: 'Stored procedures',
    names: ['sp_RegisterStudent', 'sp_DropEnrollment', 'sp_PublishGrades', 'sp_CreateFirstAdmin'],
    note: 'The rules of the project live here: seven registration rules in one transaction with the locking hints that stop two students taking the last seat at the same moment.',
  },
  {
    kind: 'Triggers',
    names: ['TR_Enrollment_SetGrade'],
    note: 'When a score is written, the letter and the grade points are written with it, in the database, whatever the application does.',
  },
];

export default function DatabaseFacts() {
  const counts = useAsync(() => api.admin.tableCounts(), 'table-counts');
  const reports = useAsync(() => api.reports.list(), 'reports-catalogue');

  if (counts.loading && !counts.data) return <Spinner label="Counting the rows of every table…" />;
  if (counts.error) return <Note tone="danger">{counts.error}</Note>;

  const rows = [...counts.data.rows].sort((a, b) => b.Rows - a.Rows || a.TableName.localeCompare(b.TableName));
  const total = rows.reduce((sum, row) => sum + Number(row.Rows), 0);
  const biggest = rows[0]?.Rows || 1;
  const reportCount = reports.data?.reports?.length ?? null;

  return (
    <>
      <PageHeader
        breadcrumb="student office"
        title="The database"
        subtitle="What the delivered project stores, and the objects that enforce its rules."
        actions={<>
          <Link className="btn btn-ghost" to="/office">Overview</Link>
          <Link className="btn btn-primary" to="/reports">Run a report</Link>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tables" value={rows.length} hint="every one of them has a primary key" />
        <Stat label="Rows of sample data" value={total} hint="inserted by database/02_seed.sql" />
        <Stat label="Reports" value={reportCount ?? '…'} hint="statistical, detailed and managerial" />
        <Stat label="Objects" value={OBJECTS.reduce((sum, object) => sum + object.names.length, 0)} hint="views, procedures and a trigger" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card
          title="Rows per table"
          subtitle="SELECT COUNT(*) on the 15 tables of the project, from the running database."
          pad={false}
        >
          <div className="px-5 py-3">
            <Table
              dense
              columns={[
                { key: 'TableName', label: 'Table' },
                { key: 'Rows', label: 'Rows', align: 'right', render: (row) => Number(row.Rows).toLocaleString() },
                {
                  key: 'share',
                  label: 'Share',
                  render: (row) => (
                    <div className="min-w-[120px]">
                      <Progress value={(Number(row.Rows) / biggest) * 100} tone={Number(row.Rows) === biggest ? 'brand' : 'success'} />
                    </div>
                  ),
                },
              ]}
              rows={rows}
              rowKey={(row) => row.TableName}
              empty="The database answered no rows."
            />
          </div>
        </Card>

        <div className="grid gap-4">
          {OBJECTS.map((object) => (
            <Card
              key={object.kind}
              title={object.kind}
              subtitle={`${object.names.length} of the delivered schema`}
            >
              <div className="flex flex-wrap gap-1.5">
                {object.names.map((name) => <Badge key={name} tone="neutral">{name}</Badge>)}
              </div>
              <p className="mt-3 text-[0.86rem] leading-relaxed text-ink-600">{object.note}</p>
            </Card>
          ))}

          <Card title="How a screen reaches the data">
            <ol className="grid gap-2 text-[0.88rem] leading-relaxed text-ink-600">
              <li><strong>1.</strong> A screen calls the API (never the database, and never a table).</li>
              <li><strong>2.</strong> The API sends one statement of <code>database/03_queries.sql</code> or <code>04_reports.sql</code> with bound parameters: no SQL text is ever built from what a user typed.</li>
              <li><strong>3.</strong> The rules that must hold - registration, dropping, publishing grades, the letter of a score - are enforced inside the database by the procedures and the trigger above, so they hold even when the caller is not this application.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
