// Memories: things imported from other networks (X, Google Keep), kept in IndexedDB on this device only.
// Nothing here is sent to the API, posted, or touched by the 40-day wipe. Each account on a device gets its
// own database, so signing in as someone else never shows your memories.
//
// A memory: {
//   id: 'x:<tweet id>' | 'keep:<created usec>', source: 'x' | 'keep',
//   kind: 'tweet' | 'reply' | 'retweet' | 'quote' | 'note' | 'list',
//   at: unix ms, md: 'MM-DD' (local day, for "on this day"), text,
//   title?, items?: [{ text, done }], labels?: string[], replyTo?, parent?: id of the post it replies to,
//   likes?, reposts?, deleted?: removed from X before the export, media?: [{ type, thumb }] (online copies),
//   files?: [{ archive, name, local, compressed, method, encrypted }] (the copies inside an archive .zip),
//   url?, rich: whether it came from a full export (a CSV row is not rich)
// }
//
// Two side stores: ARCHIVES remembers archive .zip files that hold photos and videos ({ key, name, size,
// handle? }: the handle lets Chromium browsers reopen the file next time), and CONTEXT keeps the text of
// other people's posts that a reply answers, when the archive has it ({ id, text }, from the likes list).
import { ymd } from './dates.js';

const DB_PREFIX = 'forty-memories-';
const DB_VERSION = 2;
const STORE = 'memories';
const ARCHIVES = 'archives';
const CONTEXT = 'context';
const BY_DAY = 'md';
const BY_SOURCE = 'source';
const LEAP_DAY = '02-29';
const DAY_BEFORE_LEAP_DAY = '02-28';
const CONSTRAINT_ERROR = 'ConstraintError';

export const SOURCES = {
  x: { name: 'X / Twitter', short: 'X' },
  keep: { name: 'Google Keep', short: 'Keep' }
};

export const KINDS = {
  tweet: 'Posts',
  reply: 'Replies',
  retweet: 'Reposts',
  quote: 'Quotes',
  note: 'Notes',
  list: 'Lists'
};

/** @type {{ user: string, db: Promise<IDBDatabase> } | null} */
let opened = null;
/** Every memory of the open account, newest first, once read. @type {any[] | null} */
let cache = null;

/** Settles an IndexedDB request, or a transaction once it commits or aborts, as a promise. */
function settle(request) {
  return new Promise((resolve, reject) => {
    if (request instanceof IDBTransaction) {
      // Not onerror: a request's error bubbles here even when the request handled it.
      request.oncomplete = () => resolve(undefined);
      request.onabort = () => reject(request.error ?? new Error('Saving memories was cancelled.'));
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Opens (once per account) this device's memory database. @param {string} user */
function open(user) {
  if (opened?.user === user) return opened.db;
  cache = null;
  const request = indexedDB.open(DB_PREFIX + user, DB_VERSION);
  request.onupgradeneeded = (event) => {
    const db = request.result;
    if (event.oldVersion < 1) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex(BY_DAY, BY_DAY);
      store.createIndex(BY_SOURCE, BY_SOURCE);
    }
    if (event.oldVersion < 2) {
      db.createObjectStore(ARCHIVES, { keyPath: 'key' });
      db.createObjectStore(CONTEXT, { keyPath: 'id' });
    }
  };
  opened = { user, db: settle(request) };
  return opened.db;
}

/** @param {string} user @param {IDBTransactionMode} mode @param {string | string[]} [name] store(s) */
async function tx(user, mode, name = STORE) {
  const db = await open(user);
  const t = db.transaction(name, mode);
  return { t, store: Array.isArray(name) ? null : t.objectStore(name) };
}

/** The local day of a time as 'MM-DD'. @param {number} at */
export const monthDay = (at) => ymd(new Date(at)).slice(5);

/** Every memory, newest first. Read once, then served from memory. @param {string} user */
export async function allMemories(user) {
  const db = await open(user);
  if (cache) return cache;
  const list = await settle(db.transaction(STORE).objectStore(STORE).getAll());
  cache = list.sort((a, b) => b.at - a.at);
  return cache;
}

/**
 * The 'MM-DD' days whose memories show on a calendar day: just that day, except that leap-day memories
 * also show on Feb 28 in years without a Feb 29.
 * @param {string} md @param {number} [year] the year being viewed from
 */
export function daysFor(md, year = new Date().getFullYear()) {
  const leap = new Date(year, 1, 29).getMonth() === 1;
  return md === DAY_BEFORE_LEAP_DAY && !leap ? [md, LEAP_DAY] : [md];
}

/** The memories from a calendar day ('MM-DD') in every year, newest first. @param {string} user @param {string} md */
export async function onThisDay(user, md) {
  const days = daysFor(md);
  if (cache) return cache.filter((m) => days.includes(m.md));
  const { store } = await tx(user, 'readonly');
  const found = await Promise.all(days.map((day) => settle(store.index(BY_DAY).getAll(day))));
  return found.flat().sort((a, b) => b.at - a.at);
}

/**
 * Saves imported memories. A full export overwrites what is there; a thin one (a CSV row) only fills gaps,
 * so importing tweets.csv after the archive never loses media or like counts.
 * @param {string} user @param {any[]} memories @returns {Promise<{ added: number, total: number }>}
 */
export async function saveMemories(user, memories) {
  const { t, store } = await tx(user, 'readwrite');
  // Every request is queued before the first await, so the transaction cannot close in between.
  const before = settle(store.count());
  for (const memory of memories) {
    if (memory.rich) {
      store.put(memory);
      continue;
    }
    // add() refuses a key that exists; swallow that so the rest of the transaction carries on.
    const request = store.add(memory);
    request.onerror = (event) => {
      if (request.error?.name !== CONSTRAINT_ERROR) return;
      event.preventDefault();
      event.stopPropagation();
    };
  }
  const after = settle(store.count());
  await settle(t);
  cache = null;
  // Ask the browser not to evict this database when the device runs low on space.
  navigator.storage?.persist?.().catch(() => {});
  const total = await after;
  return { added: total - (await before), total };
}

/** Deletes every memory from one source. @param {string} user @param {string} source */
export async function removeSource(user, source) {
  if (source === 'x') {
    const { t: side } = await tx(user, 'readwrite', [ARCHIVES, CONTEXT]);
    side.objectStore(ARCHIVES).clear();
    side.objectStore(CONTEXT).clear();
    await settle(side);
  }
  const { t, store } = await tx(user, 'readwrite');
  const cursor = store.index(BY_SOURCE).openKeyCursor(IDBKeyRange.only(source));
  let removed = 0;
  cursor.onsuccess = () => {
    if (!cursor.result) return;
    store.delete(cursor.result.primaryKey);
    removed++;
    cursor.result.continue();
  };
  await settle(t);
  cache = null;
  return removed;
}

/** Every side record of one kind: 'archives' or 'context'. @param {string} user @param {'archives' | 'context'} name */
export async function allOf(user, name) {
  const { store } = await tx(user, 'readonly', name);
  return settle(store.getAll());
}

/** Saves side records (archives or context), replacing any with the same key. */
export async function saveAll(user, name, records) {
  const { t, store } = await tx(user, 'readwrite', name);
  for (const record of records) store.put(record);
  await settle(t);
}
