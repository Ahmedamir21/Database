/**
 * The attendance record of the student: the rate of every course and the last sessions.
 *
 * The attendance rows are written by the teachers (dbo.Attendance, one row per student and
 * session), which is why the office can act on a rate under 75% without asking anybody.
 */
import api from '../../api.js';
import { Badge, Card, Note, PageHeader, Progress, Spinner, Table } from '../../components/ui.jsx';
import { date, percent } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

const toneFor = (rate) => (rate === null || rate === undefined ? 'neutral' : rate >= 85 ? 'success' : rate >= 75 ? 'info' : rate >= 60 ? 'warn' : 'danger');

export default function Attendance() {
  const { data, loading, error } = useAsync(() => api.student.attendance(), 'attendance');

  if (loading) return <Spinner label="Loading your attendance…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { summary, detail } = data;
  const worst = summary
    .filter((row) => row.AttendancePercent !== null)
    .sort((a, b) => Number(a.AttendancePercent) - Number(b.AttendancePercent))[0];

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Every session your teachers recorded, course by course."
      />

      {worst && Number(worst.AttendancePercent) < 75 && (
        <div className="mb-3">
          <Note tone="warn">
            Your attendance in {worst.Code} is {percent(worst.AttendancePercent)}. The office
            looks at 75%: speak to the instructor or to your advisor before it becomes a problem.
          </Note>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Attendance per course" pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'Code', label: 'Course' },
                { key: 'Title', label: 'Title' },
                { key: 'SectionCode', label: 'Sec' },
                { key: 'Sessions', label: 'Sessions', align: 'right' },
                { key: 'Present', label: 'Present', align: 'right' },
                { key: 'Absent', label: 'Absent', align: 'right' },
                { key: 'Excused', label: 'Excused', align: 'right' },
                {
                  key: 'AttendancePercent',
                  label: 'Rate',
                  render: (row) => (
                    <div className="min-w-[120px]">
                      <div className="flex items-center justify-between text-[0.8rem]">
                        <span>{percent(row.AttendancePercent)}</span>
                        <Badge tone={toneFor(Number(row.AttendancePercent))}>
                          {Number(row.AttendancePercent) >= 75 ? 'ok' : 'low'}
                        </Badge>
                      </div>
                      <Progress value={row.AttendancePercent} tone={Number(row.AttendancePercent) >= 75 ? 'success' : 'warn'} />
                    </div>
                  ),
                },
              ]}
              rows={summary}
              rowKey={(row) => `${row.Code}-${row.SectionCode}`}
              empty="No attendance has been recorded for you yet."
            />
          </div>
        </Card>

        <Card title="The last sessions" subtitle="Newest first." pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'SessionDate', label: 'Date', render: (row) => date(row.SessionDate) },
                { key: 'CourseCode', label: 'Course' },
                {
                  key: 'Status',
                  label: 'Status',
                  render: (row) => (
                    <Badge tone={row.Status === 'Present' ? 'success' : row.Status === 'Excused' ? 'info' : 'danger'}>
                      {row.Status}
                    </Badge>
                  ),
                },
              ]}
              rows={detail}
              rowKey={(row, index) => `${row.CourseCode}-${row.SessionDate}-${index}`}
              empty="No session has been recorded yet."
              dense
            />
          </div>
        </Card>
      </div>

      <p className="mt-3 text-[0.8rem] text-ink-500">
        An excused absence is kept on the record, but it does not count against the rate: the
        rule used by the office is <code>Present + Excused</code> over all recorded sessions.
      </p>
    </>
  );
}
