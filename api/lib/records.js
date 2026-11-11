// Pure helpers for habit records: day math, streaks, comparisons. No database access. Created by DOGS.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// Comparisons are hidden until this many OTHER people share the habit, so nobody can be singled out.
export const MIN_COHORT = 4;

export const dayToMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const msToDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day, n) => msToDay(dayToMs(day) + n * DAY_MS);

// A real calendar date that is not in the future (one day of slack covers every time zone).
export function isDay(day, now = Date.now()) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const ms = dayToMs(day);
  return !Number.isNaN(ms) && msToDay(ms) === day && ms <= now + DAY_MS;
}

// People tracking "Drinking " and "drinking" are compared with each other.
export const habitKey = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');

// The value of "done" that counts as a good day: doing a 'build' habit, not doing a 'quit' habit.
export const goodValue = (kind) => (kind === 'build' ? 1 : 0);

// Consecutive good days ending today (or yesterday, if today is not tracked yet).
// `logs` is one habit's rows, newest first. A slip or an untracked day ends the streak.
export function streak(logs, kind, today) {
  const want = goodValue(kind);
  let expected = logs[0]?.day === today ? today : addDays(today, -1);
  let count = 0;
  for (const log of logs) {
    if (log.day > expected) continue;
    if (log.day !== expected || log.done !== want) break;
    count++;
    expected = addDays(expected, -1);
  }
  return count;
}

// What share of the other people did this habit less often than `rate`. null if too few people.
export function percentile(rate, otherRates) {
  if (otherRates.length < MIN_COHORT) return null;
  const below = otherRates.filter((r) => r < rate).length;
  return { people: otherRates.length, moreThan: Math.round((below / otherRates.length) * 100) };
}

// The text of a shared record post. Returns null when there is nothing to share.
export function recordText(habit, share, { streakDays, weekDone, weekTracked }) {
  if (share === 'streak') {
    if (!streakDays) return null;
    const days = `${streakDays} day${streakDays === 1 ? '' : 's'}`;
    return habit.kind === 'build'
      ? `${habit.name}: ${days} in a row.`
      : `${days} clean from ${habit.name}.`;
  }
  if (!weekTracked) return null;
  return habit.kind === 'build'
    ? `${habit.name}: ${weekDone} of the last 7 days.`
    : `Clean from ${habit.name} ${weekTracked - weekDone} of the last 7 days.`;
}
