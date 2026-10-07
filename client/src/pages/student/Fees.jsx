/**
 * Fees and payments.
 *
 * The fees of a term are not a stored number: they are the registered credit hours times the
 * fee per credit hour of the program (dbo.Program.FeePerCreditHour). A dropped course costs
 * nothing, and every payment is a row of dbo.Payment with a receipt number, the method and
 * the officer who received the money.
 */
import api from '../../api.js';
import { Badge, Card, Note, PageHeader, Spinner, Stat, Table } from '../../components/ui.jsx';
import { date, money } from '../../lib/format.js';
import { useAsync } from '../../lib/useAsync.js';

export default function Fees() {
  const { data, loading, error } = useAsync(() => api.student.fees(), 'fees');

  if (loading) return <Spinner label="Loading your account…" />;
  if (error) return <Note tone="danger">{error}</Note>;

  const { terms, payments, summary } = data;

  return (
    <>
      <PageHeader
        title="Fees and payments"
        subtitle="What every term costs, what you paid, and the receipts of the finance office."
        actions={<button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print</button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Billed in total" value={money(summary.billed)} hint="all terms on record" />
        <Stat label="Paid" value={money(summary.paid)} hint={`${payments.length} payments`} />
        <Stat
          label="Balance"
          value={money(summary.balance)}
          hint={summary.balance > 0 ? 'please visit the finance desk' : 'the account is settled'}
          tone={summary.balance > 0 ? 'gold' : 'brand'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Term by term" pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'SemesterName', label: 'Term' },
                { key: 'StartDate', label: 'Starts', render: (row) => date(row.StartDate) },
                { key: 'CreditHours', label: 'Credit hours', align: 'right' },
                { key: 'FeePerCreditHour', label: 'Fee / credit', align: 'right', render: (row) => money(row.FeePerCreditHour) },
                { key: 'FeesDue', label: 'Fees', align: 'right', render: (row) => money(row.FeesDue) },
                { key: 'PaidSoFar', label: 'Paid', align: 'right', render: (row) => money(row.PaidSoFar) },
                {
                  key: 'Balance',
                  label: 'Balance',
                  align: 'right',
                  render: (row) => (
                    <span className={Number(row.Balance) > 0 ? 'font-semibold text-danger-500' : 'text-ink-600'}>
                      {money(row.Balance)}
                    </span>
                  ),
                },
              ]}
              rows={terms}
              rowKey={(row) => row.SemesterId}
              empty="There is no billable registration yet."
            />
          </div>
        </Card>

        <Card title="Receipts" subtitle="The receipt number is unique in the database (UQ_Payment_Receipt)." pad={false}>
          <div className="px-5 py-3">
            <Table
              columns={[
                { key: 'ReceiptNumber', label: 'Receipt' },
                { key: 'PaidAt', label: 'Date', render: (row) => date(row.PaidAt) },
                { key: 'SemesterName', label: 'Term' },
                { key: 'Amount', label: 'Amount', align: 'right', render: (row) => money(row.Amount) },
                { key: 'Method', label: 'Method', render: (row) => <Badge tone="info">{row.Method}</Badge> },
                { key: 'RecordedBy', label: 'Received by' },
              ]}
              rows={payments}
              rowKey={(row) => row.PaymentId}
              empty="You have not paid anything yet."
              dense
            />
          </div>
        </Card>
      </div>

      <p className="mt-3 text-[0.8rem] text-ink-500">
        The fees shown here are calculated from the credit hours of the registrations with the
        status Enrolled or Completed, multiplied by the fee per credit hour of your program. The
        finance desk records a payment with the student number, the term, the amount and the
        method; the receipt is produced by the API and never typed by hand.
      </p>
    </>
  );
}
