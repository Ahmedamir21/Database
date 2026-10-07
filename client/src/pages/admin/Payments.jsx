/**
 * The finance desk.
 *
 * A payment is recorded for one student and one term. The receipt number is produced by the
 * API (never typed), and the database keeps it unique (UQ_Payment_Receipt), so two officers
 * cannot hand out the same receipt. The page also shows what is still owed, computed from the
 * credit hours of the registrations and the fee per credit hour of the program.
 */
import { useState } from 'react';
import api from '../../api.js';
import { Badge, Card, Field, Note, PageHeader, Select, Spinner, Stat, Table } from '../../components/ui.jsx';
import { date, money } from '../../lib/format.js';
import { useAction, useAsync } from '../../lib/useAsync.js';

const METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'Bank transfer', label: 'Bank transfer' },
  { value: 'Cheque', label: 'Cheque' },
];

export default function Payments() {
  const [semesterId, setSemesterId] = useState('');
  const [form, setForm] = useState({ studentNumber: '', semesterId: '', amount: '', method: 'Cash' });
  const action = useAction();
  const { data, loading, error, reload } = useAsync(() => api.admin.payments({ semesterId }), `payments-${semesterId}`);

  if (loading && !data) return <Spinner label="Loading the payments…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const semesters = (data.semesters || []).map((row) => ({ value: row.SemesterId, label: row.Name }));
  const { summary, rows, debtors, methods } = data;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money received, by term, student and method."
        actions={
          <div className="w-52">
            <Select value={semesterId} onChange={(event) => setSemesterId(event.target.value)} placeholder="All semesters" options={semesters} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Billed" value={money(summary.Billed)} hint="registered credit hours × fee per credit" />
        <Stat label="Collected" value={money(summary.Collected)} hint={`${summary.Payments} receipts`} />
        <Stat label="Outstanding" value={money(summary.Outstanding)} hint="what the office is still owed" tone={Number(summary.Outstanding) > 0 ? 'gold' : 'brand'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="grid gap-4">
          <Card title="Receipts" subtitle="Newest first." pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'ReceiptNumber', label: 'Receipt' },
                  { key: 'PaidAt', label: 'Date', render: (row) => date(row.PaidAt) },
                  { key: 'StudentNumber', label: 'Student no.' },
                  { key: 'StudentName', label: 'Student' },
                  { key: 'SemesterName', label: 'Term' },
                  { key: 'Amount', label: 'Amount', align: 'right', render: (row) => money(row.Amount) },
                  { key: 'Method', label: 'Method', render: (row) => <Badge tone="info">{row.Method}</Badge> },
                  { key: 'RecordedBy', label: 'Officer' },
                ]}
                rows={rows}
                rowKey={(row) => row.PaymentId}
                empty="No payment with these filters."
                dense
              />
            </div>
          </Card>

          <Card title="Who still owes money" subtitle="Students with a balance above one hundred pounds." pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'StudentNumber', label: 'Number' },
                  { key: 'FullName', label: 'Student' },
                  { key: 'ProgramName', label: 'Program' },
                  { key: 'SemesterName', label: 'Term' },
                  { key: 'Fees', label: 'Fees', align: 'right', render: (row) => money(row.Fees) },
                  { key: 'Paid', label: 'Paid', align: 'right', render: (row) => money(row.Paid) },
                  { key: 'Balance', label: 'Owes', align: 'right', render: (row) => <span className="font-semibold text-danger-500">{money(row.Balance)}</span> },
                ]}
                rows={debtors}
                rowKey={(row) => `${row.StudentId}-${row.SemesterId}`}
                empty="Nobody owes money in this filter."
                dense
              />
            </div>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card title="Record a payment">
            <form
              className="grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                await action.exec(() => api.admin.recordPayment(form), {
                  onSuccess: () => { setForm({ ...form, studentNumber: '', amount: '' }); reload(); },
                });
              }}
            >
              <Field label="Student number" hint="The number printed on the student card, for example 20230009.">
                <input className="input" value={form.studentNumber} onChange={(event) => setForm({ ...form, studentNumber: event.target.value })} required />
              </Field>
              <Field label="Term">
                <Select value={form.semesterId} onChange={(event) => setForm({ ...form, semesterId: event.target.value })} options={semesters} placeholder="Choose the term" />
              </Field>
              <Field label="Amount (EGP)">
                <input className="input" type="number" min="1" step="50" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
              </Field>
              <Field label="Method">
                <Select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} options={METHODS} />
              </Field>
              {action.error && <Note tone="danger">{action.error}</Note>}
              {action.message && <Note tone="success" onClose={action.clear}>{action.message}</Note>}
              <button className="btn btn-primary" type="submit" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save the payment'}</button>
            </form>
          </Card>

          <Card title="How the money came in" subtitle="Grouped by method, over the current filter." pad={false}>
            <div className="px-5 py-3">
              <Table
                columns={[
                  { key: 'Method', label: 'Method' },
                  { key: 'Payments', label: 'Receipts', align: 'right' },
                  { key: 'Amount', label: 'Amount', align: 'right', render: (row) => money(row.Amount) },
                  { key: 'SharePercent', label: 'Share', align: 'right', render: (row) => `${row.SharePercent}%` },
                ]}
                rows={methods}
                rowKey={(row) => row.Method}
                empty="No payment yet."
                dense
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
