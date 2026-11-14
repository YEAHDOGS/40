// Threads and the timeline: how posts connect. A reply to one of your own posts hangs under it as a branch,
// so a thread (or a back-and-forth you kept answering) reads as one tree. A reply to someone else starts its
// own tree; their post is not in the archive, only its id, the @name, and its text when you liked it.

/** @typedef {{ byId: Map<string, any>, children: Map<string, any[]> }} ThreadIndex */

const indexes = new WeakMap();
const MONTH_FORMAT = { month: 'long', year: 'numeric' };

/** The memory id of a post's parent. @param {any} memory */
export const parentId = (memory) => (memory.parent ? `x:${memory.parent}` : null);

/** Lookups for a memory list, built once per list. @param {any[]} list @returns {ThreadIndex} */
export function threadIndex(list) {
  let index = indexes.get(list);
  if (index) return index;
  index = { byId: new Map(list.map((m) => [m.id, m])), children: new Map() };
  // The list is newest first, so walking it backwards files replies oldest first.
  for (let i = list.length - 1; i >= 0; i--) {
    const key = parentId(list[i]);
    if (!key || !index.byId.has(key)) continue;
    if (!index.children.has(key)) index.children.set(key, []);
    index.children.get(key).push(list[i]);
  }
  indexes.set(list, index);
  return index;
}

/** The first post of the tree a memory belongs to. @param {ThreadIndex} index @param {any} memory */
export function rootOf(index, memory) {
  let node = memory;
  const seen = new Set();
  while (parentId(node) && index.byId.has(parentId(node)) && !seen.has(node.id)) {
    seen.add(node.id);
    node = index.byId.get(parentId(node));
  }
  return node;
}

/** How many posts hang below a memory, at any depth. @param {ThreadIndex} index @param {any} memory */
export function countBelow(index, memory) {
  let count = 0;
  const stack = [...(index.children.get(memory.id) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    count++;
    stack.push(...(index.children.get(node.id) ?? []));
  }
  return count;
}

/**
 * The timeline: trees (a post whose parent is not one of yours, with its branches) grouped by month.
 * @param {any[]} list newest first @param {{ hidden: string[], oldest: boolean }} options
 * @returns {{ key: string, label: string, count: number, trees: any[] }[]}
 */
export function timelineMonths(list, { hidden, oldest }) {
  const index = threadIndex(list);
  const months = [];
  let current = null;
  const ordered = oldest ? [...list].reverse() : list;
  for (const memory of ordered) {
    if (hidden.includes(memory.kind)) continue;
    // Branches show under their root, so only roots enter the timeline.
    const parent = parentId(memory);
    if (parent && index.byId.has(parent)) continue;
    const date = new Date(memory.at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (current?.key !== key) {
      current = { key, label: date.toLocaleDateString(undefined, MONTH_FORMAT), count: 0, trees: [] };
      months.push(current);
    }
    current.trees.push(memory);
    current.count += 1 + countBelow(index, memory);
  }
  return months;
}

/**
 * Posts per month across the whole span, oldest first, months without posts included (for the scrubber).
 * @param {any[]} list newest first @returns {{ key: string, label: string, count: number }[]}
 */
export function monthCounts(list) {
  if (!list.length) return [];
  const counts = new Map();
  for (const m of list) {
    const d = new Date(m.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const first = new Date(list.at(-1).at);
  const last = new Date(list[0].at);
  const out = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= last; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleDateString(undefined, MONTH_FORMAT), count: counts.get(key) ?? 0 });
  }
  return out;
}
