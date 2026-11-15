// The account backup of memory text (api/lib/memories.js, packed by ./backup.js). It is on when the
// account has any backup rows. A sync sends only the chunks whose hash changed and fetches only the chunks
// another device changed. Removing a source here removes it from the backup too. Photos and videos stay
// on the device.
import { api } from '#lib/api.js';
import { addMissing } from '#lib/memories.js';
import { MAX_CHUNKS, canBackUp, pack, unpack } from './backup.js';
import { memories } from './state.svelte.js';

const PATH = '/api/memories';
// chunk name -> the hash this device last sent or fetched, per account.
const SYNCED_KEY = 'forty.memories.synced.';
const TOO_MANY_REQUESTS = 429;
const RETRY_MS = 5_000;
const RETRIES = 3;
const MB = 1e6;

/** chunks: the account's backup rows ({ chunk, hash, count, bytes }), or null until asked. */
export const backup = $state({ supported: canBackUp(), busy: false, status: '', error: '', chunks: null });

let checkedFor = '';

const chunkPath = (name) => `${PATH}/${encodeURIComponent(name)}`;

/** The API, waiting and trying again when the per-minute limit is hit. */
async function call(path, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api(path, init);
    } catch (err) {
      if (err?.status !== TOO_MANY_REQUESTS || attempt >= RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

function readSynced(user) {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_KEY + user) ?? '{}');
  } catch {
    return {};
  }
}

/** Asks once per session whether the account has a backup. @param {string} user */
export async function checkBackup(user) {
  if (!backup.supported || checkedFor === user) return;
  checkedFor = user;
  // Another account signed in on this tab: never show the last one's backup.
  backup.chunks = null;
  backup.status = '';
  backup.error = '';
  try {
    backup.chunks = (await call(PATH)).chunks;
  } catch {
    checkedFor = '';
  }
}

/** Backs up, restores, or both: brings the account and this device to the same memories. @param {string} user */
export async function syncBackup(user) {
  if (backup.busy || !backup.supported) return;
  backup.busy = true;
  backup.error = '';
  const synced = readSynced(user);
  const save = () => localStorage.setItem(SYNCED_KEY + user, JSON.stringify(synced));
  try {
    backup.status = 'Checking your backup';
    const server = (await call(PATH)).chunks;
    backup.status = 'Packing your memories';
    let plan = await pack(memories.list ?? [], memories.context);

    // Chunks another device changed since this one last saw them; everything when this device has nothing
    // (a new device, or the browser cleared its storage).
    const planned = new Map(plan.map((c) => [c.name, c.hash]));
    const fresh = !plan.length;
    const stale = server.filter(
      (s) => planned.get(s.chunk) !== s.hash && (fresh || synced[s.chunk] !== s.hash)
    );
    let restored = 0;
    if (stale.length) {
      const found = { memories: [], context: [] };
      for (const [i, s] of stale.entries()) {
        backup.status = `Fetching ${i + 1} of ${stale.length}`;
        const part = await unpack((await call(chunkPath(s.chunk))).data);
        found.memories.push(...part.memories);
        found.context.push(...part.context);
      }
      restored = await addMissing(user, found.memories, found.context);
      for (const s of stale) synced[s.chunk] = s.hash;
      save();
      await memories.load(user);
      plan = await pack(memories.list, memories.context);
    }

    // Chunks the plan no longer uses (it moved to quarters or years, or split a month) go first, so the new
    // ones fit under the row limit. Their posts are on this device now.
    const names = new Set(plan.map((c) => c.name));
    for (const s of server.filter((s) => !names.has(s.chunk))) {
      await call(chunkPath(s.chunk), { method: 'DELETE' });
      delete synced[s.chunk];
    }
    save();
    const held = new Map(server.map((s) => [s.chunk, s.hash]));
    const send = plan.filter((c) => held.get(c.name) !== c.hash);
    for (const [i, c] of send.entries()) {
      backup.status = `Saving ${i + 1} of ${send.length}`;
      await call(chunkPath(c.name), { method: 'PUT', json: { hash: c.hash, count: c.count, data: c.data } });
      synced[c.name] = c.hash;
      save();
    }

    backup.chunks = plan.map((c) => ({ chunk: c.name, hash: c.hash, count: c.count, bytes: c.data.length }));
    const total = plan.reduce((n, c) => n + c.count, 0);
    const size = (plan.reduce((n, c) => n + c.data.length, 0) / MB).toFixed(1);
    backup.status =
      (restored ? `Restored ${restored.toLocaleString()} memories. ` : '') +
      `${total.toLocaleString()} backed up in ${plan.length} of ${MAX_CHUNKS} rows (${size} MB).`;
  } catch (err) {
    backup.status = '';
    backup.error = err?.message || 'The backup did not finish. Try again.';
  }
  backup.busy = false;
}

/** Deletes the account backup. This device keeps its memories. @param {string} user */
export async function deleteBackup(user) {
  if (backup.busy) return;
  backup.busy = true;
  backup.error = '';
  try {
    await call(PATH, { method: 'DELETE' });
    localStorage.removeItem(SYNCED_KEY + user);
    backup.chunks = [];
    backup.status = 'Backup deleted from your account. This device still has your memories.';
  } catch (err) {
    backup.error = err?.message || 'The backup could not be deleted. Try again.';
  }
  backup.busy = false;
}

/**
 * Before a source is removed from this device: removes it from the backup too, so the next sync does not
 * bring it back. @param {string} user @param {string} source
 */
export async function forgetSource(user, source) {
  if (!backup.chunks?.length) return;
  const synced = readSynced(user);
  const server = (await call(PATH)).chunks;
  for (const { chunk } of server.filter((c) => c.chunk.startsWith(`${source}:`))) {
    await call(chunkPath(chunk), { method: 'DELETE' });
    delete synced[chunk];
  }
  localStorage.setItem(SYNCED_KEY + user, JSON.stringify(synced));
  backup.chunks = server.filter((c) => !c.chunk.startsWith(`${source}:`));
}

/** After an import: keeps an existing backup current. @param {string} user */
export const keepBackedUp = (user) => (backup.chunks?.length ? syncBackup(user) : Promise.resolve());
