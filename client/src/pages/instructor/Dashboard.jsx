/**
 * The teaching dashboard: the sections of the signed in teacher, how full they are, and how
 * much of the grading is already done. From here the teacher opens one section and works
 * inside it (roster, scores, attendance, statistics, notices).
 */
import { Link } from 'react-router-dom';
import api from '../../api.js';
import { useSession } from '../../App.jsx';
import { Badge, Card, Note, PageHeader, Progress, Spinner, Stat, Table } from '../../components/ui.jsx';
import { dayName, timeRange } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

export default function TeachingDashboard() {
  const { user } = useSession();
  const { data, loading, error } = useAsync(() => api.instructor.overview(), 'instructor-overview');
  const archive = useAsync(() => api.instructor.sections(), 'instructor-sections-all');

  if (loading) return <Spinner label="Loading your sections…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { term, sections, students, allSections, publishedSections } = data;
  const registered = sections.reduce((sum, row) => sum + row.Enrolled, 0);

  return (
    <>
      <PageHeader
        breadcrumb={term?.Name || 'current term'}
        title={`Good day, ${user?.title || ''} ${user?.fullName?.split(' ').slice(-1)[0] || ''}`}
        subtitle={`${user?.departmentName || ''} · ${sections.length} sections in ${term?.Name || 'this term'}`}
        actions={<Link className="btn btn-ghost" to="/teaching/students">All my students</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sections this term" value={sections.length} hint={`${allSections} in total on record`} />
        <Stat label="Students" value={registered} hint={`${students} different students`} />
        <Stat label="Published" value={`${publishedSections} / ${allSections}`} hint="sections with the grades sent out" />
        <Stat label="Waiting" value={sections.reduce((sum, row) => sum + (row.Enrolled - row.Published), 0)} hint="students without a published grade" />
      </div>

      <div className="mt-4 grid gap-4">
        {sections.map((section) => (
          <Card
            key={section.SectionId}
            title={`${section.Code} — ${section.Title}`}
            subtitle={`Section ${section.SectionCode} · ${section.CreditHours} credits · ${dayName(section.DayOfWeek)} ${timeRange(section.StartTime, section.EndTime)} · ${section.RoomName}`}
            actions={<Link className="btn btn-primary" to={`/teaching/sections/${section.SectionId}`}>Open the section</Link>}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[0.78rem] uppercase tracking-wide text-ink-500">Seats</p>
                <p className="mt-0.5 text-[0.95rem] font-medium">{section.Enrolled} of {section.Capacity}</p>
                <div className="mt-1.5">
                  <Progress value={section.fillPercent} tone={section.fillPercent > 95 ? 'warn' : 'brand'} />
                </div>
              </div>
              <div>
                <p className="text-[0.78rem] uppercase tracking-wide text-ink-500">Average score</p>
                <p className="mt-0.5 text-[0.95rem] font-medium">{section.AverageScore ?? 'not graded yet'}</p>
              </div>
              <div>
                <p className="text-[0.78rem] uppercase tracking-wide text-ink-500">Grading</p>
                <p className="mt-0.5 text-[0.95rem] font-medium">
                  {section.Published} of {section.Enrolled} published
                </p>
                <div className="mt-1.5">
                  {section.publishedAll
                    ? <Badge tone="success">all grades published</Badge>
                    : <Badge tone="warn">still open</Badge>}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {sections.length === 0 && (
          <Card title="No section in this term">
            <p className="text-[0.9rem] text-ink-500">
              The office has not given you a section for the current term yet.
            </p>
          </Card>
        )}
      </div>

      <div className="mt-4">
        <h2 className="mb-2 font-serif text-[1.15rem] text-brand-700">All my sections, on record</h2>
        <Card pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'SemesterName', label: 'Term' },
                { key: 'Code', label: 'Course' },
                { key: 'Title', label: 'Title' },
                { key: 'SectionCode', label: 'Sec' },
                { key: 'Enrolled', label: 'Students', align: 'right' },
                { key: 'Published', label: 'Published', align: 'right' },
                { key: 'AverageScore', label: 'Average', align: 'right', render: (row) => (row.AverageScore ?? '—') },
                { key: 'open', label: '', render: (row) => <Link className="text-brand-600 hover:underline" to={`/teaching/sections/${row.SectionId}`}>open</Link> },
              ]}
              rows={archive.data?.rows || []}
              rowKey={(row) => row.SectionId}
              empty="You have no section on record yet."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
