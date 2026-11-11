// Calendar days are plain local-date strings, 'YYYY-MM-DD', everywhere in the app.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const pad = (n) => String(n).padStart(2, '0');

export const ymd = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => ymd(new Date());
export const monthOf = (day) => day.slice(0, 7);

// 'YYYY-MM' moved by n months.
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

export const monthLabel = (month) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

export const dayLabel = (day) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

// The cells of a month grid: null for the blanks before the 1st, then each day string.
export function monthCells(month) {
  const [y, m] = month.split('-').map(Number);
  const blanks = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  return [
    ...Array(blanks).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)
  ];
}

// '39d 4h' until a unix-ms time.
export function countdown(endsAt, now = Date.now()) {
  const left = Math.max(0, endsAt - now);
  return `${Math.floor(left / DAY_MS)}d ${Math.floor((left % DAY_MS) / HOUR_MS)}h`;
}

// '5m', '3h', '2d' since a unix-ms time.
export function ago(time, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - time) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
