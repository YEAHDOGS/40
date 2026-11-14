// State shared by the Memories tabs: the loaded list, and the sort and kind filters remembered on this device.
import { allMemories } from '#lib/memories.js';

const PREFS_KEY = 'forty.memories.prefs';
const DEFAULT_PREFS = { sort: 'newest', hidden: [] };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** { sort, hidden: kinds left out of every tab }. Call savePrefs() after changing it. */
export const prefs = $state(loadPrefs());

export function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: prefs.sort, hidden: prefs.hidden }));
}

// Raw: tens of thousands of read-only records do not need deep reactivity.
let list = $state.raw(null);

export const memories = {
  /** Every memory, newest first, or null until read. @type {any[] | null} */
  get list() {
    return list;
  },
  /** Reads the list again, after an import or a removal. @param {string} user */
  async load(user) {
    list = await allMemories(user);
  }
};

/** Toggles a kind in or out of the lists. @param {string} kind */
export function toggleKind(kind) {
  prefs.hidden = prefs.hidden.includes(kind)
    ? prefs.hidden.filter((k) => k !== kind)
    : [...prefs.hidden, kind];
  savePrefs();
}
