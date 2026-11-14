// Numbers for the Stats and Hits tabs, worked out from the memory list on this device.
// Engagement is likes + reposts, and only counts your own words: reposts of other people are left out.
import { ymd } from '#lib/dates.js';

const DAY_MS = 86_400_000;
const TOP = 5;
const TOP_PEOPLE = 8;
// A group needs this many posts before its average says anything.
const MIN_GROUP = 20;
const MIN_LIFT = 1.15;
const SHORT_TEXT = 80;
const LONG_TEXT = 200;
const HOUR_BANDS = [
  ['Late night (0-5h)', 0, 6],
  ['Morning (6-11h)', 6, 12],
  ['Afternoon (12-17h)', 12, 18],
  ['Evening (18-23h)', 18, 24]
];
const WEEKDAY_FORMAT = { weekday: 'long' };
const WEEKDAY_SHORT = { weekday: 'short' };
// Any week, to name weekdays in the reader's language. 2023-01-01 was a Sunday.
const A_SUNDAY = new Date(2023, 0, 1);
const KIND_MOVES = { tweet: 'Plain posts', reply: 'Replies', quote: 'Quote posts' };

/** likes + reposts. @param {any} m */
export const engagement = (m) => (m.likes ?? 0) + (m.reposts ?? 0);

/** Whether a memory counts toward engagement: your own words from a full export. @param {any} m */
export const ownWords = (m) => m.source === 'x' && m.kind !== 'retweet' && m.rich;

const weekdayName = (i, format = WEEKDAY_FORMAT) =>
  new Date(A_SUNDAY.getFullYear(), 0, 1 + i).toLocaleDateString(undefined, format);

/** Weekday labels, Sunday first, short. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayName(i, WEEKDAY_SHORT));

/**
 * The longest run of consecutive days in a sorted list of 'YYYY-MM-DD' days, and the run that ends today or
 * yesterday.
 * @param {string[]} days ascending, unique
 */
function streaks(days) {
  let best = { length: 0, from: '', to: '' };
  let run = { length: 0, from: '', to: '' };
  let previous = null;
  for (const day of days) {
    const time = new Date(`${day}T12:00:00`).getTime();
    const next = previous !== null && Math.round((time - previous) / DAY_MS) === 1;
    run = next ? { ...run, length: run.length + 1, to: day } : { length: 1, from: day, to: day };
    if (run.length > best.length) best = run;
    previous = time;
  }
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - DAY_MS));
  const current = run.to === today || run.to === yesterday ? run : { length: 0, from: '', to: '' };
  return { best, current };
}

/** Average engagement per post of a group, or null when the group is too small. @param {any[]} group */
function average(group) {
  if (group.length < MIN_GROUP) return null;
  return group.reduce((sum, m) => sum + engagement(m), 0) / group.length;
}

/**
 * What works: groups of your posts whose average engagement beats (or trails) your overall average.
 * @param {any[]} own @param {number} overall
 * @returns {{ wins: Move[], flops: Move[] }}
 * @typedef {{ label: string, lift: number, avg: number, n: number }} Move
 */
function bestMoves(own, overall) {
  if (!overall) return { wins: [], flops: [] };
  const groups = [];
  for (const [kind, label] of Object.entries(KIND_MOVES)) groups.push([label, own.filter((m) => m.kind === kind)]);
  groups.push(['With a photo or video', own.filter((m) => m.media?.length || m.files?.length)]);
  groups.push(['Text only', own.filter((m) => !m.media?.length && !m.files?.length)]);
  groups.push([`Short (under ${SHORT_TEXT} characters)`, own.filter((m) => m.text.length < SHORT_TEXT)]);
  groups.push([`Long (over ${LONG_TEXT} characters)`, own.filter((m) => m.text.length > LONG_TEXT)]);
  groups.push(['With a link', own.filter((m) => /https?:\/\//.test(m.text))]);
  for (const [label, from, to] of HOUR_BANDS) {
    groups.push([label, own.filter((m) => {
      const hour = new Date(m.at).getHours();
      return hour >= from && hour < to;
    })]);
  }
  for (let day = 0; day < 7; day++) {
    groups.push([`On ${weekdayName(day)}s`, own.filter((m) => new Date(m.at).getDay() === day)]);
  }
  const moves = groups
    .map(([label, group]) => {
      const avg = average(group);
      return avg === null ? null : { label, avg, lift: avg / overall, n: group.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.lift - a.lift);
  return {
    wins: moves.filter((m) => m.lift >= MIN_LIFT).slice(0, TOP),
    flops: moves.filter((m) => m.lift <= 1 / MIN_LIFT).reverse().slice(0, TOP)
  };
}

/** Everything the Stats tab shows. @param {any[]} list newest first */
export function computeStats(list) {
  const posts = list.filter((m) => m.source === 'x');
  const own = posts.filter(ownWords);
  const byKind = {};
  const perDay = new Map();
  const perYear = new Map();
  const perMonth = new Map();
  const weekdays = Array(7).fill(0);
  const hours = Array(24).fill(0);
  const people = new Map();
  // Replies to your own posts carry your own @name: leave it out of "who you reply to".
  const ids = new Set(posts.map((m) => m.id));
  const selves = new Set(posts.filter((m) => m.parent && ids.has(`x:${m.parent}`)).map((m) => m.replyTo));
  for (const m of posts) {
    const date = new Date(m.at);
    const day = ymd(date);
    byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    perYear.set(date.getFullYear(), (perYear.get(date.getFullYear()) ?? 0) + 1);
    perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + 1);
    weekdays[date.getDay()]++;
    hours[date.getHours()]++;
    if (m.kind === 'reply' && m.replyTo && !selves.has(m.replyTo)) people.set(m.replyTo, (people.get(m.replyTo) ?? 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  const first = posts.at(-1)?.at;
  const last = posts[0]?.at;
  const spanDays = first ? Math.max(1, Math.round((last - first) / DAY_MS) + 1) : 0;
  const likes = own.reduce((sum, m) => sum + (m.likes ?? 0), 0);
  const reposts = own.reduce((sum, m) => sum + (m.reposts ?? 0), 0);
  const overall = own.length ? (likes + reposts) / own.length : 0;
  const top = (map, n = TOP) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

  return {
    total: posts.length,
    notes: list.length - posts.length,
    byKind,
    first,
    last,
    spanDays,
    activeDays: days.length,
    perActiveDay: days.length ? posts.length / days.length : 0,
    busiestDays: top(perDay).map(([day, count]) => ({ day, count })),
    busiestMonth: top(perMonth, 1).map(([month, count]) => ({ month, count }))[0],
    perYear: [...perYear].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count })),
    weekdays,
    hours,
    streaks: streaks(days),
    likes,
    reposts,
    overall,
    mostEngaged: [...own].sort((a, b) => engagement(b) - engagement(a) || b.at - a.at).slice(0, TOP),
    people: top(people, TOP_PEOPLE).map(([name, count]) => ({ name, count })),
    moves: bestMoves(own, overall)
  };
}

/**
 * Greatest hits: your most engaged posts, all time or in one year, by a chosen measure.
 * @param {any[]} list @param {{ year: string, by: 'both' | 'likes' | 'reposts', hidden: string[] }} options
 */
export function greatestHits(list, { year, by, hidden }) {
  const score = by === 'likes' ? (m) => m.likes ?? 0 : by === 'reposts' ? (m) => m.reposts ?? 0 : engagement;
  return list
    .filter((m) => ownWords(m) && !hidden.includes(m.kind) && score(m) > 0)
    .filter((m) => !year || new Date(m.at).getFullYear() === Number(year))
    .sort((a, b) => score(b) - score(a) || b.at - a.at);
}

/** The single most engaged post of each year, newest year first. @param {any[]} list */
export function hitOfEachYear(list) {
  const best = new Map();
  for (const m of list) {
    if (!ownWords(m) || !engagement(m)) continue;
    const year = new Date(m.at).getFullYear();
    if (!best.has(year) || engagement(m) > engagement(best.get(year))) best.set(year, m);
  }
  return [...best].sort((a, b) => b[0] - a[0]);
}
