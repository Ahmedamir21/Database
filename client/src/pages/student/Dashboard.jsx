/**
 * The student dashboard: the answer to "what do I have this week, how am I doing and what do
 * I still owe". Every number comes from the API, which reads it from the project database.
 */
import { Link } from 'react-router-dom';
import api from '../../api.js';
import { useSession } from '../../App.jsx';
import {
  Badge, Card, KeyValue, Note, PageHeader, Progress, Spinner, Stat, Table,
} from '../../components/ui.jsx';
import { date, dayName, money, timeRange } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

export default function Dashboard() {
  const { user } = useSession();
  const { data, loading, error } = useAsync(() => api.student.overview(), 'student-overview');

  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { term, sections, load, gpa, finance, advisor, announcements } = data;
  const progress = gpa.passedCreditHours && user?.totalCreditHours
    ? Math.round((gpa.passedCreditHours / user.totalCreditHours) * 1000) / 10
    : 0;

  return (
    <>
      <PageHeader
        breadcrumb={`${term?.Name || 'current term'} · registration until ${date(term?.RegistrationDeadline)}`}
        title={`Welcome, ${user?.fullName?.split(' ')[0]}`}
        subtitle={`${user?.programName || ''} · level ${user?.level || '—'} · student number ${user?.studentNumber || '—'}`}
        actions={<>
          <Link className="btn btn-primary" to="/catalogue">Register in a course</Link>
          <Link className="btn btn-ghost" to="/transcript">My transcript</Link>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cumulative GPA" value={gpa.cumulativeGpa ?? '—'} hint={gpa.standing.label} tone={gpa.standing.tone === 'danger' ? 'brand' : 'brand'} />
        <Stat label="Credits passed" value={gpa.passedCreditHours} hint={`of ${user?.totalCreditHours || '—'} needed for the degree`} />
        <Stat label="This term" value={`${load.CreditHours} cr`} hint={`${load.Courses} courses registered`} />
        <Stat label="Balance" value={money(finance.balance)} hint={finance.balance > 0 ? 'please visit the finance desk' : 'nothing to pay'} tone="gold" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card title="My courses this term" subtitle={`${term?.Name || ''} · ${load.Courses} courses · ${load.CreditHours} credit hours`} pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Code', label: 'Course' },
                { key: 'Title', label: 'Title' },
                { key: 'CreditHours', label: 'Cr', align: 'right' },
                { key: 'SectionCode', label: 'Sec' },
                { key: 'slot', label: 'When', render: (row) => `${dayName(row.DayOfWeek)} ${timeRange(row.StartTime, row.EndTime)}` },
                { key: 'InstructorName', label: 'Teacher' },
                { key: 'RoomName', label: 'Room' },
              ]}
              rows={sections}
              rowKey={(row) => row.EnrollmentId}
              empty="You are not registered in any course yet. Open the registration page to choose your courses."
            />
          </div>
        </Card>

        <div className="grid gap-4">
          <Card title="Progress to the degree">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-[1.3rem] text-brand-600">{progress}%</span>
              <span className="text-[0.82rem] text-ink-500">{gpa.passedCreditHours} / {user?.totalCreditHours || '—'} credits</span>
            </div>
            <div className="mt-2"><Progress value={progress} tone={progress > 66 ? 'success' : progress > 33 ? 'brand' : 'warn'} /></div>
            <p className="mt-2 text-[0.82rem] text-ink-500">
              A course counts once it is completed with a score of 60 or more.
            </p>
          </Card>

          <Card title="My advisor">
            {advisor?.AdvisorName ? (
              <KeyValue rows={[
                { label: 'Advisor', value: `${advisor.AdvisorTitle || ''} ${advisor.AdvisorName}` },
                { label: 'E-mail', value: advisor.AdvisorEmail },
                { label: 'Department', value: advisor.AdvisorDepartment },
                { label: 'Office hours', value: advisor.AdvisorSlots },
              ]} />
            ) : <p className="text-[0.88rem] text-ink-500">No advisor has been assigned yet.</p>}
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="Latest announcements">
          <ul className="grid gap-2">
            {announcements.length === 0 && <li className="text-[0.88rem] text-ink-500">Nothing new.</li>}
            {announcements.map((row) => (
              <li key={row.AnnouncementId} className="rounded-xl border border-ink-200 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {row.IsPinned && <Badge tone="gold">pinned</Badge>}
                  <span className="font-medium text-ink-800">{row.Title}</span>
                  <span className="text-[0.76rem] text-ink-500">{row.CourseCode || 'everybody'} · {date(row.PostedAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[0.86rem] text-ink-600">{row.Body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3"><Link className="text-[0.86rem] font-semibold text-brand-600 hover:underline" to="/announcements">All announcements →</Link></div>
        </Card>

        <Card title="What to do next">
          <ul className="grid gap-2 text-[0.9rem] text-ink-700">
            <li>· Register until <strong>{date(term?.RegistrationDeadline)}</strong>; dropping is possible until <strong>{date(term?.DropDeadline)}</strong>.</li>
            <li>· The credit limit of one term is 18 hours; the rules of a prerequisite are checked by the database when you register.</li>
            <li>· Your fees are calculated from the registered credit hours of every term (see <Link className="text-brand-600 hover:underline" to="/fees">Fees and payments</Link>).</li>
            <li>· Marks appear in the transcript only after the teacher publishes them.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
