/**
 * The transcript: every course of every term, the GPA of each term and the cumulative GPA.
 *
 * The GPA on this page is calculated twice on purpose: once by SQL Server (the view
 * vw_StudentGpa and the cumulative query) and once in JavaScript (src/rules/grading.js, the
 * same scale as the database functions). The two numbers have to agree, and the page says so:
 * that is a visible proof that the application and the database use one grade scale.
 */
import api from '../../api.js';
import { Badge, Card, Note, PageHeader, Spinner, Stat, Table } from '../../components/ui.jsx';
import { date, gradeTone, statusTone } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

export default function Transcript() {
  const { data, loading, error } = useAsync(() => api.student.transcript(), 'transcript');

  if (loading) return <Spinner label="Loading your transcript…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { rows, byTerm, summary } = data;
  const agrees = summary.computedGpa === null || summary.cumulativeGpa === null
    || Math.abs(Number(summary.computedGpa) - Number(summary.cumulativeGpa)) < 0.005;

  return (
    <>
      <PageHeader
        title="Transcript"
        subtitle="The official record of every course you took, with the term it belongs to."
        actions={<button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print</button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cumulative GPA" value={summary.cumulativeGpa ?? '—'} hint={summary.standing.label} />
        <Stat label="Graded credit hours" value={summary.gradedCreditHours} hint="courses with a published grade" />
        <Stat label="Passed credit hours" value={summary.passedCreditHours} hint="score of 60 or more" />
        <Stat label="Terms on record" value={byTerm.length} hint="with a published grade" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Courses" pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'SemesterName', label: 'Term' },
                { key: 'Code', label: 'Course' },
                { key: 'Title', label: 'Title' },
                { key: 'CreditHours', label: 'Cr', align: 'right' },
                { key: 'Score', label: 'Score', align: 'right', render: (row) => (row.Score ?? '—') },
                { key: 'LetterGrade', label: 'Grade', render: (row) => (row.LetterGrade ? <Badge tone={gradeTone(row.LetterGrade)}>{row.LetterGrade}</Badge> : '—') },
                { key: 'GradePoints', label: 'Points', align: 'right', render: (row) => (row.GradePoints ?? '—') },
                { key: 'Status', label: 'Status', render: (row) => <Badge tone={statusTone(row.Status)}>{row.Status}</Badge> },
                { key: 'InstructorName', label: 'Teacher' },
              ]}
              rows={rows}
              rowKey={(row) => `${row.SemesterId}-${row.Code}`}
              empty="There is no course on your record yet."
            />
          </div>
        </Card>

        <div className="grid gap-4">
          <Card title="GPA per term" subtitle="Read from the view vw_StudentGpa." pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'SemesterName', label: 'Term' },
                  { key: 'CreditHours', label: 'Graded cr', align: 'right' },
                  { key: 'SemesterGpa', label: 'GPA', align: 'right' },
                ]}
                rows={byTerm}
                rowKey={(row) => row.SemesterId}
                empty="No term with a published grade yet."
              />
            </div>
          </Card>

          <Card title="How these numbers are produced">
            <ul className="grid gap-2 text-[0.87rem] text-ink-600">
              <li>· The letter and the grade points of every course are written by the trigger <code>TR_Enrollment_SetGrade</code> when a score is saved.</li>
              <li>· The scale is the one of the project: A 93, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D+ 67, D 60, and F under 60.</li>
              <li>· The GPA of a term is the quality points divided by the graded credit hours, rounded to two decimals.</li>
              <li>· A course counts once it is <em>completed with a published score</em>; a dropped course never counts.</li>
            </ul>
            <div className="mt-3">
              <Note tone={agrees ? 'success' : 'warn'}>
                {agrees
                  ? `The application recalculated the GPA and found the same value (${summary.cumulativeGpa ?? '—'}).`
                  : `Attention: SQL Server says ${summary.cumulativeGpa} and the application says ${summary.computedGpa}.`}
              </Note>
            </div>
            <p className="mt-3 text-[0.78rem] text-ink-500">
              This transcript was printed from the portal on {date(new Date(), true)}.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
