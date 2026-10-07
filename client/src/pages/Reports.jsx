/**
 * The report page: the list of reports on the left, the parameters and the table on the right.
 *
 * The client knows nothing about the SQL of a report. It sends the key of the report and the
 * values of the parameters, and the API answers with the columns, the rows and the totals -
 * that is why one screen can show all 28 reports of the project, and why the statement text
 * never travels to the browser (it is not part of any answer).
 *
 * A report with no required parameter runs as soon as it is opened; the others wait for the
 * dropdowns. Every change of a parameter runs the report again, so the screen always shows
 * the numbers of the database, not a copy of them.
 *
 * A teacher sees the reports of teaching only, and only about their own sections: the API
 * decides that, not this page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api.js';
import {
  Badge, Card, Empty, Field, Note, PageHeader, ReportTable, Select, Spinner,
} from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';

/** what each group of the list means - the same words as REPORT_CATEGORIES on the server */
const CATEGORY_HINTS = {
  Statistical: 'Counts, averages, distributions and rates.',
  Detailed: 'Everything about one student, one section, one term or one room.',
  Managerial: 'The overview the head of the office reads, with trends and risks.',
};

/** a parameter of a report is a dropdown; kind says which one */
const KINDS = {
  semester: { options: 'semesters', placeholder: 'the open semester (the default)' },
  student: { options: 'students', placeholder: 'choose a student' },
  section: { options: 'sections', placeholder: 'choose a section' },
  instructor: { options: 'instructors', placeholder: 'choose a teacher' },
};

/** one line of a CSV, with the quotes a spreadsheet expects */
function csvLine(values) {
  return values.map((value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',');
}

export default function Reports() {
  const { key } = useParams();
  const navigate = useNavigate();
  const catalogue = useAsync(() => api.reports.list(), 'reports');
  const options = useAsync(() => api.reports.options(), 'reports-options');
  const [values, setValues] = useState({});

  const reports = catalogue.data?.reports || [];
  const current = useMemo(
    () => reports.find((report) => report.key === key) || (key ? null : reports[0]),
    [reports, key],
  );

  // the address of a report is its key, so a report can be linked and bookmarked
  useEffect(() => {
    if (!key && reports.length) navigate(`/reports/${reports[0].key}`, { replace: true });
  }, [key, reports.length, navigate]);

  // a new report starts with empty dropdowns
  useEffect(() => { setValues({}); }, [current?.key]);

  const missing = current
    ? current.params.filter((param) => param.required && !values[param.name])
    : ['the report'];
  const ready = Boolean(current) && missing.length === 0;
  const runKey = ready ? `${current.key}:${JSON.stringify(values)}` : `idle:${key || ''}`;

  const result = useAsync(
    () => (ready ? api.reports.run(current.key, values) : Promise.resolve(null)),
    runKey,
  );

  if (catalogue.loading && !catalogue.data) return <Spinner label="Loading the report list…" />;
  if (catalogue.error) return <Note tone="danger">{catalogue.error}</Note>;
  if (!reports.length) {
    return (
      <Empty title="No report is open to this account">
        A student account has no reports; the office and the teachers do.
      </Empty>
    );
  }

  const grouped = Object.entries(
    reports.reduce((carry, report) => {
      carry[report.category] = [...(carry[report.category] || []), report];
      return carry;
    }, {}),
  );

  const optionLabel = (kind, value) => {
    const list = options.data?.[KINDS[kind]?.options] || [];
    return list.find((item) => String(item.id) === String(value))?.label || value;
  };

  const download = () => {
    if (!result.data?.rows?.length) return;
    const { columns, rows, key: reportKey } = result.data;
    const text = [csvLine(columns), ...rows.map((row) => csvLine(columns.map((column) => row[column])))].join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportKey.replace('.', '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        breadcrumb={api.isMock() ? 'demonstration mode' : 'the office and the teachers'}
        title="Reports"
        subtitle="Statistical, detailed and managerial reports - every one of them is a query of the project database."
        actions={result.data ? <>
          <button type="button" className="btn btn-ghost" onClick={download}>Download CSV</button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print</button>
        </> : null}
      />

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <Card title="The reports of this account" subtitle={`${reports.length} report(s)`} pad={false}>
          <nav className="max-h-[70vh] overflow-y-auto px-3 py-3">
            {grouped.map(([category, list]) => (
              <div key={category} className="mb-3">
                <p className="px-1 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-400">{category}</p>
                <p className="px-1 pb-1 text-[0.76rem] text-ink-400">{CATEGORY_HINTS[category]}</p>
                <ul>
                  {list.map((report) => (
                    <li key={report.key}>
                      <button
                        type="button"
                        onClick={() => navigate(`/reports/${report.key}`)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-[0.86rem] leading-snug ${
                          report.key === current?.key
                            ? 'bg-brand-50 font-semibold text-brand-700'
                            : 'text-ink-600 hover:bg-ink-50'
                        }`}
                      >
                        <span className="mr-1.5 font-mono text-[0.74rem] text-ink-400">{report.key}</span>
                        {report.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Card>

        <div className="grid gap-4">
          {current && (
            <Card
              title={`${current.key} — ${current.title}`}
              subtitle={current.description}
              actions={<Badge tone={current.category === 'Managerial' ? 'gold' : current.category === 'Detailed' ? 'info' : 'success'}>{current.category}</Badge>}
            >
              {current.params.length === 0 ? (
                <p className="text-[0.86rem] text-ink-500">This report has no parameter: it always reads the whole database.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {current.params.map((param) => {
                    const kind = KINDS[param.kind] || {};
                    const list = (options.data?.[kind.options] || []).map((item) => ({ value: item.id, label: item.label }));
                    return (
                      <Field
                        key={param.name}
                        label={param.label || param.name}
                        hint={param.required ? 'required' : 'optional'}
                      >
                        <Select
                          value={values[param.name] ?? ''}
                          onChange={(event) => setValues((old) => ({ ...old, [param.name]: event.target.value }))}
                          options={list}
                          placeholder={kind.placeholder || '—'}
                        />
                      </Field>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {current && !ready && (
            <Note tone="info">
              Choose {missing.map((param) => param.label || param.name).join(' and ')} above to run {current.key}.
            </Note>
          )}

          {result.error && <Note tone="danger">{result.error}</Note>}

          {current && ready && (
            <Card
              pad={false}
              title="The answer"
              subtitle={result.data
                ? `${result.data.rowCount} row(s)${result.data.usedParams && Object.keys(result.data.usedParams).length
                  ? ` — ${Object.entries(result.data.usedParams).map(([name, value]) => {
                    const param = current.params.find((item) => item.name === name);
                    return `${param?.label || name}: ${param ? optionLabel(param.kind, value) : value}`;
                  }).join(', ')}`
                  : ''}`
                : 'reading the database…'}
            >
              <div className="px-5 py-3">
                {result.loading && !result.data && <Spinner label="Running the report…" />}
                {result.data && (
                  result.data.rows.length
                    ? <ReportTable columns={result.data.columns} rows={result.data.rows} totals={result.data.totals} labels={result.data.labels} />
                    : <p className="py-4 text-center text-[0.9rem] text-ink-500">The database has nothing to show for this choice.</p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
