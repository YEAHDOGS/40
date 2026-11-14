// Reads single files out of a .zip in the browser without loading the whole archive: the central directory
// sits at the end, so only it and the wanted entries are read, even from a multi-gigabyte X archive.
// Handles Zip64 (archives over 4 GB). Deflate needs DecompressionStream('deflate-raw'), feature-detected by
// canUnzip(): Chrome 103, Firefox 113, Safari 16.4.

const EOCD_SIG = 0x06054b50;
const EOCD_SIZE = 22;
// The end record plus the longest possible zip comment.
const EOCD_SEARCH = EOCD_SIZE + 0xffff;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_EOCD_SIZE = 56;
const ZIP64_EXTRA_ID = 0x0001;
const CENTRAL_SIG = 0x02014b50;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 1;
const UTF8 = new TextDecoder();
const BACKSLASH = '\\';

/** Identifies an archive by name and size, so picking the same file again matches. @param {{ name: string, size: number }} file */
export const archiveKey = (file) => `${file.name}:${file.size}`;

/** Whether this browser can unpack deflated zip entries. */
export function canUnzip() {
  try {
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

/** @param {Blob} file @param {number} start @param {number} [end] */
async function view(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** Finds where the central directory is and how many entries it holds. @param {Blob} file */
async function directory(file) {
  const tailStart = Math.max(0, file.size - EOCD_SEARCH);
  const tail = await view(file, tailStart);
  let eocd = tail.byteLength - EOCD_SIZE;
  while (eocd >= 0 && tail.getUint32(eocd, true) !== EOCD_SIG) eocd--;
  if (eocd < 0) throw new Error('This file is not a zip archive.');

  const found = {
    count: tail.getUint16(eocd + 10, true),
    size: tail.getUint32(eocd + 12, true),
    offset: tail.getUint32(eocd + 16, true)
  };
  const locator = eocd - ZIP64_LOCATOR_SIZE;
  const zip64 = found.offset === MAX_U32 || found.count === MAX_U16;
  if (!zip64 || locator < 0 || tail.getUint32(locator, true) !== ZIP64_LOCATOR_SIG) return found;

  const at = Number(tail.getBigUint64(locator + 8, true));
  const record = await view(file, at, at + ZIP64_EOCD_SIZE);
  if (record.getUint32(0, true) !== ZIP64_EOCD_SIG) throw new Error('This zip archive is damaged.');
  return {
    count: Number(record.getBigUint64(32, true)),
    size: Number(record.getBigUint64(40, true)),
    offset: Number(record.getBigUint64(48, true))
  };
}

/**
 * Lists a zip's entries.
 * @param {Blob} file
 * @returns {Promise<{ name: string, method: number, encrypted: boolean, compressed: number, local: number }[]>}
 */
export async function listZip(file) {
  const { count, size, offset } = await directory(file);
  const cd = await view(file, offset, offset + size);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + CENTRAL_HEADER_SIZE <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== CENTRAL_SIG) break;
    const nameLength = cd.getUint16(p + 28, true);
    const extraLength = cd.getUint16(p + 30, true);
    const commentLength = cd.getUint16(p + 32, true);
    const entry = {
      // Some Windows zippers write backslashes; the format says forward slashes.
      name: UTF8.decode(
        new Uint8Array(cd.buffer, cd.byteOffset + p + CENTRAL_HEADER_SIZE, nameLength)
      ).replaceAll(BACKSLASH, '/'),
      method: cd.getUint16(p + 10, true),
      encrypted: Boolean(cd.getUint16(p + 8, true) & FLAG_ENCRYPTED),
      compressed: cd.getUint32(p + 20, true),
      local: cd.getUint32(p + 42, true)
    };
    const uncompressedIsZip64 = cd.getUint32(p + 24, true) === MAX_U32;

    // Zip64 keeps the real sizes and offset in an extra field, only for the values that overflowed.
    const extraEnd = p + CENTRAL_HEADER_SIZE + nameLength + extraLength;
    for (let e = p + CENTRAL_HEADER_SIZE + nameLength; e + 4 <= extraEnd; ) {
      const id = cd.getUint16(e, true);
      const length = cd.getUint16(e + 2, true);
      if (id === ZIP64_EXTRA_ID) {
        let field = e + 4 + (uncompressedIsZip64 ? 8 : 0);
        if (entry.compressed === MAX_U32) {
          entry.compressed = Number(cd.getBigUint64(field, true));
          field += 8;
        }
        if (entry.local === MAX_U32) entry.local = Number(cd.getBigUint64(field, true));
      }
      e += 4 + length;
    }

    entries.push(entry);
    p = extraEnd + commentLength;
  }
  return entries;
}

/**
 * Unpacks one entry, as a Response to read with .text() or .blob(). Stored entries are sliced, never copied.
 * @param {Blob} file @param {{ name: string, method: number, encrypted: boolean, compressed: number, local: number }} entry
 */
export async function readZip(file, entry) {
  if (entry.encrypted) throw new Error(`${entry.name} is password protected.`);
  const head = await view(file, entry.local, entry.local + LOCAL_HEADER_SIZE);
  const start = entry.local + LOCAL_HEADER_SIZE + head.getUint16(26, true) + head.getUint16(28, true);
  const data = file.slice(start, start + entry.compressed);
  if (entry.method === METHOD_STORED) return new Response(data);
  if (entry.method !== METHOD_DEFLATE) throw new Error(`Cannot unpack ${entry.name}.`);
  return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw')));
}
