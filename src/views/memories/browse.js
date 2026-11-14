// Search, sort and filter for the Memories screen. Plain functions over the in-memory list, fast enough to
// run on every keystroke for tens of thousands of memories.

export const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  liked: 'Most liked',
  reposted: 'Most reposted',
  longest: 'Longest'
};

const SORTERS = {
  newest: (a, b) => b.at - a.at,
  oldest: (a, b) => a.at - b.at,
  liked: (a, b) => (b.likes ?? 0) - (a.likes ?? 0) || b.at - a.at,
  reposted: (a, b) => (b.reposts ?? 0) - (a.reposts ?? 0) || b.at - a.at,
  longest: (a, b) => b.text.length - a.text.length || b.at - a.at
};

const MAX_TOKENS = 8;

// Lowercased searchable text per memory, built once.
const haystacks = new WeakMap();
function haystack(memory) {
  let text = haystacks.get(memory);
  if (text !== undefined) return text;
  text = [
    memory.title,
    memory.text,
    memory.replyTo && `@${memory.replyTo}`,
    ...(memory.items ?? []).map((i) => i.text),
    ...(memory.labels ?? [])
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  haystacks.set(memory, text);
  return text;
}

/** The words of a search, lowercased. @param {string} query */
export const tokens = (query) => query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);

/**
 * Filters and sorts memories. Every search word must appear.
 * @param {any[]} list
 * @param {{ words: string[], sort: string, hidden: string[], year: string, source: string }} options
 */
export function browse(list, { words, sort, hidden, year, source }) {
  const found = list.filter(
    (m) =>
      !hidden.includes(m.kind) &&
      (!source || m.source === source) &&
      (!year || new Date(m.at).getFullYear() === Number(year)) &&
      words.every((word) => haystack(m).includes(word))
  );
  return found.sort(SORTERS[sort] ?? SORTERS.newest);
}

/** The years memories come from, newest first. @param {any[]} list */
export function yearsOf(list) {
  return [...new Set(list.map((m) => new Date(m.at).getFullYear()))].sort((a, b) => b - a);
}

/** Groups a newest-first list by year: [[2025, [...]], [2024, [...]]]. @param {any[]} list */
export function byYear(list) {
  const groups = new Map();
  for (const m of list) {
    const year = new Date(m.at).getFullYear();
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(m);
  }
  return [...groups];
}

/**
 * Splits text into plain and matching parts, for highlighting search words.
 * @param {string} text @param {string[]} words @returns {{ text: string, hit: boolean }[]}
 */
export function highlight(text, words) {
  if (!words.length || !text) return [{ text, hit: false }];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text
    .split(new RegExp(`(${escaped.join('|')})`, 'gi'))
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}
