// /api/memories: the opt-in text backup of a person's imported memories (src/views/memories/backup.js).
// The app packs posts into gzip-compressed chunks (one per month, quarter or year) and sends them as base64
// text; the Worker only checks sizes and stores them, so a backup costs a few dozen rows and almost no
// CPU. Photos and videos are never sent. Created by DOGS.
import { HttpError } from './routes.js';

/** Rows one person may keep. */
export const MAX_CHUNKS = 100;
/** Base64 characters per chunk (about 512 KB of gzip), well under D1's 2 MB per value. */
export const MAX_CHUNK_CHARS = 700_000;
/** Base64 characters per person, every chunk together. */
export const MAX_TOTAL_CHARS = 10_000_000;
/** A request body: the chunk plus its small JSON wrapper. */
export const MAX_PUT_BODY = MAX_CHUNK_CHARS + 1_000;
const MAX_COUNT = 1_000_000;
// 'x:2025-02', 'keep:2024-q3', 'x:2019', and a split part 'x:2019.2'.
const CHUNK_RE = /^[a-z]{1,12}:\d{4}(-\d{2}|-q[1-4])?(\.\d{1,2})?$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
// gzip's first two bytes (1f 8b), base64-encoded.
const GZIP_PREFIX = 'H4sI';

const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
const chunkName = (value) => (CHUNK_RE.test(value || '') ? value : fail('bad chunk'));

/** What is backed up: one line per chunk, without the data. */
async function listChunks({ env, user }) {
  const { results } = await env.DB.prepare(
    'select "chunk", "hash", "count", "bytes", "updatedAt" from "memory_chunk" where "userId" = ? order by "chunk"'
  )
    .bind(user.id)
    .all();
  return {
    chunks: results,
    limits: { chunks: MAX_CHUNKS, chunkChars: MAX_CHUNK_CHARS, totalChars: MAX_TOTAL_CHARS }
  };
}

async function getChunk({ env, user, params }) {
  const row = await env.DB.prepare(
    'select "chunk", "hash", "count", "data" from "memory_chunk" where "userId" = ? and "chunk" = ?'
  )
    .bind(user.id, chunkName(params.chunk))
    .first();
  return row || fail('chunk not found', 404);
}

/** Saves one chunk, refused when it would pass the row or size limit. Body: { hash, count, data }. */
async function putChunk({ env, user, params, body }) {
  const chunk = chunkName(params.chunk);
  const { hash, count, data } = body;
  if (!HASH_RE.test(hash || '')) fail('bad hash');
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) fail('bad count');
  if (typeof data !== 'string' || !data.startsWith(GZIP_PREFIX) || !BASE64_RE.test(data)) fail('bad data');
  if (data.length > MAX_CHUNK_CHARS) fail('chunk too large', 413);

  // One statement checks both limits against every other chunk and writes, so two tabs cannot race past.
  const result = await env.DB.prepare(
    `insert into "memory_chunk" ("userId", "chunk", "hash", "count", "bytes", "data", "updatedAt")
    select ?1, ?2, ?3, ?4, ?5, ?6, ?7
    where (select count(*) from "memory_chunk" where "userId" = ?1 and "chunk" <> ?2) < ?8
      and (select coalesce(sum("bytes"), 0) from "memory_chunk" where "userId" = ?1 and "chunk" <> ?2) + ?5 <= ?9
    on conflict ("userId", "chunk") do update set
      "hash" = excluded."hash", "count" = excluded."count", "bytes" = excluded."bytes",
      "data" = excluded."data", "updatedAt" = excluded."updatedAt"`
  )
    .bind(user.id, chunk, hash, count, data.length, data, Date.now(), MAX_CHUNKS, MAX_TOTAL_CHARS)
    .run();
  if (!result.meta.changes) fail(`your backup is full (${MAX_CHUNKS} chunks or ${MAX_TOTAL_CHARS / 1e6} MB)`, 409);
  return { chunk, hash, count, bytes: data.length };
}

async function deleteChunk({ env, user, params }) {
  await env.DB.prepare('delete from "memory_chunk" where "userId" = ? and "chunk" = ?')
    .bind(user.id, chunkName(params.chunk))
    .run();
  return { ok: true };
}

async function deleteAll({ env, user }) {
  await env.DB.prepare('delete from "memory_chunk" where "userId" = ?').bind(user.id).run();
  return { ok: true };
}

// [method, path, handler, largest body accepted]
export const MEMORY_ROUTES = [
  ['GET', '/api/memories', listChunks],
  ['DELETE', '/api/memories', deleteAll],
  ['GET', '/api/memories/:chunk', getChunk],
  ['PUT', '/api/memories/:chunk', putChunk, MAX_PUT_BODY],
  ['DELETE', '/api/memories/:chunk', deleteChunk]
];
