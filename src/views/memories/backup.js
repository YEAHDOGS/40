// Packing memories for the account backup (api/lib/memories.js): text only, never photos or videos.
// Posts are grouped by source and UTC month into gzip-compressed JSON chunks, sent as base64. When there
// are too many months for the row limit the chunks become quarters, then years; a chunk too big for one
// row is split into numbered parts. Each chunk carries the reply context its posts need.

// The same limits the Worker enforces.
export const MAX_CHUNKS = 100;
export const MAX_CHUNK_CHARS = 700_000;
export const MAX_TOTAL_CHARS = 10_000_000;
const FORMAT = 1;
const MAX_PARTS = 99;
const MONTHS_PER_QUARTER = 3;
const GZIP = 'gzip';
// Everything a memory needs except media: `media` (online copies) and `files` (inside the .zip) stay on
// the device, and `md` is worked out again in the restoring device's time zone.
const TEXT_FIELDS = [
  'id', 'source', 'kind', 'at', 'text', 'title', 'items', 'labels', 'replyTo', 'parent',
  'likes', 'reposts', 'deleted', 'url', 'rich'
];

/** UTC periods, finest first: the chunk key after the source. */
const PERIODS = [
  (d) => d.toISOString().slice(0, 7),
  (d) => `${d.getUTCFullYear()}-q${Math.floor(d.getUTCMonth() / MONTHS_PER_QUARTER) + 1}`,
  (d) => String(d.getUTCFullYear())
];

function textOnly(memory) {
  const out = {};
  for (const key of TEXT_FIELDS) if (memory[key] !== undefined) out[key] = memory[key];
  return out;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gzipBase64(text) {
  const blob = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream(GZIP))).blob();
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

/** Whether this browser can compress (Chrome 80+, Firefox 113+, Safari 16.4+). */
export const canBackUp = () =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && !!crypto.subtle;

/** A chunk's records, from its base64 data. @param {string} data @returns {Promise<{ memories: any[], context: any[] }>} */
export async function unpack(data) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(GZIP))).text();
  const parsed = JSON.parse(text);
  return { memories: parsed.memories ?? [], context: parsed.context ?? [] };
}

/** One group as one chunk, or as numbered parts when it is too big for a row. */
async function encode(name, items, context) {
  let parts = 1;
  attempt: while (parts <= Math.min(MAX_PARTS, items.length)) {
    const size = Math.ceil(items.length / parts);
    const chunks = [];
    for (let start = 0; start < items.length; start += size) {
      const slice = items.slice(start, start + size);
      const parents = new Set(slice.map((m) => m.parent).filter(Boolean));
      const payload = JSON.stringify({
        v: FORMAT,
        memories: slice,
        context: [...parents].filter((id) => context.has(id)).map((id) => ({ id, text: context.get(id) }))
      });
      const data = await gzipBase64(payload);
      if (data.length > MAX_CHUNK_CHARS) {
        // Too big: try again with enough parts for this slice's size.
        parts = Math.max(parts + 1, Math.ceil((parts * data.length) / MAX_CHUNK_CHARS));
        continue attempt;
      }
      const part = parts === 1 ? name : `${name}.${chunks.length + 1}`;
      chunks.push({ name: part, hash: await sha256(payload), count: slice.length, data });
    }
    return chunks;
  }
  throw new Error('Some of your memories are too big to back up.');
}

/**
 * Every memory as backup chunks: [{ name, hash, count, data }], at most MAX_CHUNKS. The hash is of the
 * uncompressed JSON, so unchanged months keep their hash and are not sent again.
 * @param {any[]} list @param {Map<string, string>} context
 */
export async function pack(list, context) {
  const sorted = list
    .filter((m) => Number.isFinite(m.at) && m.source)
    .map(textOnly)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const period of PERIODS) {
    const groups = new Map();
    for (const memory of sorted) {
      const name = `${memory.source}:${period(new Date(memory.at))}`;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(memory);
    }
    if (groups.size > MAX_CHUNKS) continue;
    const chunks = [];
    for (const [name, items] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
      chunks.push(...(await encode(name, items, context)));
      if (chunks.length > MAX_CHUNKS) break;
    }
    if (chunks.length > MAX_CHUNKS) continue;
    if (chunks.reduce((n, c) => n + c.data.length, 0) > MAX_TOTAL_CHARS) break;
    return chunks;
  }
  throw new Error(`Your memories need more than ${MAX_CHUNKS} rows or ${MAX_TOTAL_CHARS / 1e6} MB, the most a backup can hold.`);
}
