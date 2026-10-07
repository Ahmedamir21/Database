/**
 * The small building blocks of every screen.
 *
 * They exist so that a page never decides by itself what a table, a badge or a form field
 * looks like: the screen describes WHAT it shows (a table of registrations, a warning, a
 * number) and this file decides HOW it looks. That is what keeps the interface consistent
 * and what makes the interface review quick.
 */
import { labelOf } from '../lib/format.js';

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[0.98rem] font-semibold text-brand-600">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[0.82rem] text-ink-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: 'bg-ink-100 text-ink-600 border-ink-200',
  info: 'bg-brand-50 text-brand-600 border-brand-200',
  success: 'bg-ok-50 text-ok-500 border-[#bfe3ca]',
  warn: 'bg-warn-50 text-warn-500 border-[#f0d9a8]',
  danger: 'bg-danger-50 text-danger-500 border-[#e7b7b7]',
  gold: 'bg-[#fdf6e3] text-gold-600 border-[#eddfb4]',
};

export function Badge({ tone = 'neutral', children }) {
  return <span className={`chip ${TONES[tone] || TONES.neutral}`}>{children}</span>;
}

export function Stat({ label, value, hint, tone = 'brand', icon }) {
  return (
    <div className="card card-pad">
      <p className="text-[0.74rem] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 font-serif text-[1.6rem] leading-tight ${tone === 'gold' ? 'text-gold-600' : 'text-brand-600'}`}>
        {icon} {value}
      </p>
      {hint && <p className="mt-0.5 text-[0.8rem] text-ink-500">{hint}</p>}
    </div>
  );
}

export function Progress({ value, tone = 'brand' }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  const colours = { brand: 'bg-brand-500', success: 'bg-ok-500', warn: 'bg-gold-500', danger: 'bg-danger-500' };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(width)}>
      <div className={`h-full rounded-full ${colours[tone] || colours.brand}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * A table from a list of objects. The screen passes the columns it wants with a label, so no
 * screen has to repeat the drawing of a header, a badge cell or an amount.
 */
export function Table({ columns, rows, empty = 'Nothing to show.', rowKey, onRowClick, dense = false }) {
  if (!rows || rows.length === 0) {
    return <p className="px-1 py-6 text-center text-[0.9rem] text-ink-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'text-right' : ''}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row) : index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={`${column.align === 'right' ? 'text-right' : ''} ${dense ? 'py-1.5' : ''}`}>
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** a table drawn straight from the answer of a report: the columns come from the database */
export function ReportTable({ columns, rows, totals, labels = {} }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={typeof rows[0]?.[column] === 'number' ? 'text-right' : ''}>
                {labels[column] || labelOf(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => {
                const value = row[column];
                return (
                  <td key={column} className={typeof value === 'number' ? 'text-right tabular-nums' : ''}>
                    {value === null || value === undefined
                      ? '—'
                      : typeof value === 'number'
                        ? (Number.isInteger(value) ? value : value.toFixed(2))
                        : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="bg-ink-50 font-semibold">
              {columns.map((column, index) => (
                <td key={column} className={`py-2 ${typeof totals[column] === 'number' ? 'text-right tabular-nums' : ''}`}>
                  {index === 0 ? 'Total' : (totals[column] !== undefined ? totals[column].toFixed(2) : '')}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.78rem] text-ink-500">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options = [], placeholder, name, disabled }) {
  return (
    <select className="input" value={value ?? ''} onChange={onChange} name={name} disabled={disabled}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function Note({ tone = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`chip w-full justify-between rounded-xl border px-3.5 py-2.5 text-[0.86rem] font-medium ${TONES[tone] || TONES.info}`}>
      <span className="whitespace-pre-wrap text-left">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="no-print ml-3 shrink-0 text-ink-500 hover:text-ink-700">✕</button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-6 text-[0.9rem] text-ink-500">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500" />
      {label}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 print:mb-2">
      <div>
        {breadcrumb && <p className="text-[0.78rem] font-medium uppercase tracking-wide text-ink-400">{breadcrumb}</p>}
        <h1 className="font-serif text-[1.55rem] leading-tight text-brand-700">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[0.9rem] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="card card-pad text-center">
      <p className="font-serif text-[1.1rem] text-brand-600">{title}</p>
      {children && <p className="mt-1 text-[0.9rem] text-ink-500">{children}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function KeyValue({ rows }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.filter(Boolean).map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1.5">
          <dt className="text-[0.84rem] text-ink-500">{row.label}</dt>
          <dd className="text-right text-[0.9rem] font-medium text-ink-800">{row.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
