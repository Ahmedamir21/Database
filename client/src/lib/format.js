/** Formatting helpers: one place decides how a date, a time or an amount is printed. */

const DAYS = ['', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const dayName = (dayOfWeek) => DAYS[Number(dayOfWeek)] || '';

export function timeRange(start, end) {
  const short = (value) => String(value || '').slice(0, 5);
  if (!start || !end) return '';
  return `${short(start)} – ${short(end)}`;
}

export function money(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

export function shortMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toFixed(2);
}

export function date(value, withTime = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  const text = parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return text;
  const time = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${text} ${time}`;
}

export function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

/** "SemesterGpaRun" -> "Semester Gpa Run", so a report can print any column without a map */
export function labelOf(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isNumeric(value) {
  return typeof value === 'number';
}

export function percent(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export const gradeTone = (letter) => {
  if (!letter) return 'neutral';
  if (letter.startsWith('A')) return 'success';
  if (letter.startsWith('B')) return 'info';
  if (letter.startsWith('C')) return 'warn';
  if (letter.startsWith('D')) return 'warn';
  return 'danger';
};

export const statusTone = (status) => ({
  Enrolled: 'info',
  Completed: 'success',
  Dropped: 'neutral',
  Withdrawn: 'warn',
  Paid: 'success',
  Partial: 'warn',
  Unpaid: 'danger',
  Overdue: 'danger',
  Refunded: 'neutral',
}[status] || 'neutral');
