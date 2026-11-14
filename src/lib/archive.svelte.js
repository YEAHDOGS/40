// Photos and videos inside an X archive .zip, read straight from the file the person picked, never copied:
// a 6 GB archive stays where it is and only the file being looked at is unpacked.
//
// The browser forgets a picked file when the page closes. Chromium browsers (Chrome, Edge, the Windows app)
// hand out a file handle that is stored with the memories and reopened with one click next time; elsewhere
// the person picks the archive again to see its media. Without the archive, posts fall back to X's online
// copies.
import { allOf, saveAll } from './memories.js';
import { archiveKey, readZip } from './zip.js';

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime' };
const VIDEO = /\.(mp4|mov)$/i;
const READ = { mode: 'read' };
const GRANTED = 'granted';

/**
 * known: archives remembered for this account ({ key, name, size, handle? }); open: key -> File for the
 * ones readable right now.
 */
export const archives = $state({ known: [], open: {} });

// Object URLs for unpacked media, by archive key + entry name. Kept for the session.
const urls = new Map();


/** Whether a media entry is a video. @param {{ name: string }} entry */
export const isVideo = (entry) => VIDEO.test(entry.name);

/** Loads the remembered archives and reopens those the browser still allows. @param {string} user */
export async function restoreArchives(user) {
  archives.known = await allOf(user, 'archives');
  for (const record of archives.known) {
    if (archives.open[record.key] || !record.handle) continue;
    if ((await record.handle.queryPermission?.(READ)) === GRANTED) {
      archives.open[record.key] = await record.handle.getFile();
    }
  }
}

/** Reopens a remembered archive by its handle; must run from a click. @param {{ key: string, handle: any }} record */
export async function allowArchive(record) {
  if ((await record.handle.requestPermission(READ)) !== GRANTED) return false;
  archives.open[record.key] = await record.handle.getFile();
  return true;
}

/**
 * Makes picked archives readable for this session and remembers them (with their handle when the browser
 * gives one). Returns the keys that matched a known archive or were added.
 * @param {string} user @param {{ file: File, handle?: any }[]} picked
 */
export async function connectArchives(user, picked) {
  const records = picked.map(({ file, handle }) => ({
    key: archiveKey(file),
    name: file.name,
    size: file.size,
    ...(handle ? { handle } : {})
  }));
  for (const [i, { file }] of picked.entries()) archives.open[records[i].key] = file;
  await saveAll(user, 'archives', records);
  archives.known = await allOf(user, 'archives');
  return records.map((r) => r.key);
}

/** Opens a file picked to show media, if it is a known archive (same size, any name). @param {File} file */
export function reconnectArchive(file) {
  const record = archives.known.find((r) => r.size === file.size);
  if (!record) return false;
  archives.open[record.key] = file;
  return true;
}

/**
 * An object URL for one media file inside an open archive, or null while the archive is not open.
 * @param {{ archive: string, name: string, local: number, compressed: number, method: number, encrypted: boolean }} entry
 */
export async function mediaUrl(entry) {
  const file = archives.open[entry.archive];
  if (!file) return null;
  const id = `${entry.archive}/${entry.name}`;
  if (urls.has(id)) return urls.get(id);
  const blob = await (await readZip(file, entry)).blob();
  const type = MIME[entry.name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
  const url = URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
  urls.set(id, url);
  return url;
}

/** Frees an unpacked video once nothing shows it (photos stay cached: they are small). */
export function releaseMedia(entry) {
  const id = `${entry.archive}/${entry.name}`;
  if (!isVideo(entry) || !urls.has(id)) return;
  URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
