// Turns export files from other networks into memories (the shape is documented in src/lib/memories.js).
// Everything is read on this device; nothing is uploaded.
//
// X / Twitter: the archive .zip ("Download an archive of your data"), data/tweets.js (or tweets-part1.js...)
//   from inside it, a tweets.json array, or a tweets.csv with tweet_id, text, created_on, tweet_type columns.
//   From the .zip also: deleted and community posts, an index of the photos and videos in tweets_media (read
//   later straight from the zip, see src/lib/archive.svelte.js), and from like.js the text of other people's
//   posts that a reply answers, so replies keep some of their conversation.
// Google Keep: the Google Takeout .zip, or the note .json files from its Takeout/Keep folder.
import { monthDay } from '#lib/memories.js';
import { archiveKey, canUnzip, listZip, readZip } from '#lib/zip.js';

const X_POSTS_ENTRY = /(^|\/)data\/(tweets?|community-tweet)(-part\d+)?\.js$/i;
const X_DELETED_ENTRY = /(^|\/)data\/deleted-tweets(-part\d+)?\.js$/i;
const X_LIKES_ENTRY = /(^|\/)data\/like(-part\d+)?\.js$/i;
// data/tweets_media/<post id>-<file name>; deleted posts keep theirs in deleted_tweets_media.
const X_MEDIA_ENTRY = /(^|\/)data\/(deleted_)?tweets_media\/(\d+)-[^/]+$/i;
const KEEP_ENTRY = /(^|\/)Keep\/[^/]+\.json$/i;
const RETWEET_PREFIX = 'RT @';
// A link to another post, which makes a post a quote.
const STATUS_LINK = /^https?:\/\/(www\.|mobile\.)?(twitter|x)\.com\/\w+\/status(es)?\/\d+/i;
const STATUS_URL = 'https://x.com/i/status/';
const CSV_KINDS = { tweet: 'tweet', reply: 'reply', retweet: 'retweet', quote: 'quote' };
// Column names that different tweet CSV exporters use.
const CSV_COLUMNS = {
  id: ['tweet_id', 'id', 'id_str'],
  text: ['text', 'full_text', 'tweet', 'content'],
  at: ['created_on', 'created_at', 'date', 'timestamp'],
  kind: ['tweet_type', 'type', 'kind']
};
const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const HTML_ENTITY = /&(amp|lt|gt|quot|#39);/g;
const USEC_PER_MS = 1000;
const BOM = /^﻿/;
const NO_UNZIP =
  'This browser cannot open .zip files. Unzip the archive and pick the file inside instead.';

const decode = (text) => text.replace(HTML_ENTITY, (entity) => HTML_ENTITIES[entity]);

/** One post from an X archive (tweets.js) or a tweets.json array. */
function fromTweet(raw) {
  const t = raw?.tweet ?? raw;
  const id = t?.id_str ?? (t?.id != null ? String(t.id) : '');
  const at = Date.parse(t?.created_at);
  if (!id || Number.isNaN(at)) return null;

  const entities = t.entities ?? {};
  const urls = entities.urls ?? [];
  let text = decode(t.full_text ?? t.text ?? '');
  for (const u of urls) if (u.url && u.expanded_url) text = text.replaceAll(u.url, u.expanded_url);
  const media = (t.extended_entities ?? entities).media ?? [];
  for (const m of media) if (m.url) text = text.replaceAll(m.url, '');

  let kind = 'tweet';
  if (text.startsWith(RETWEET_PREFIX)) kind = 'retweet';
  else if (t.in_reply_to_status_id_str || t.in_reply_to_status_id) kind = 'reply';
  else if (urls.some((u) => STATUS_LINK.test(u.expanded_url ?? ''))) kind = 'quote';

  return {
    id: `x:${id}`,
    source: 'x',
    kind,
    at,
    md: monthDay(at),
    text: text.trim(),
    replyTo: t.in_reply_to_screen_name || undefined,
    parent: t.in_reply_to_status_id_str || (t.in_reply_to_status_id ? String(t.in_reply_to_status_id) : undefined),
    likes: Number(t.favorite_count) || 0,
    reposts: Number(t.retweet_count) || 0,
    media: media.map((m) => ({
      type: m.type ?? 'photo',
      thumb: (m.media_url_https ?? m.media_url ?? '').replace(/^http:/, 'https:')
    })),
    url: STATUS_URL + id,
    rich: true
  };
}

/** X's archive files are JavaScript: `window.YTD.tweets.part0 = [ ... ]`. */
function fromXScript(text) {
  const start = text.indexOf('[');
  if (start < 0) throw new Error('No posts found in this file.');
  return JSON.parse(text.slice(start));
}

/** A small CSV reader: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (quoted) field += c;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

function fromXCsv(text) {
  const [header = [], ...rows] = parseCsv(text.replace(BOM, ''));
  const names = header.map((name) => name.trim().toLowerCase());
  const column = Object.fromEntries(
    Object.entries(CSV_COLUMNS).map(([key, options]) => [key, names.findIndex((n) => options.includes(n))])
  );
  if (column.id < 0 || column.text < 0 || column.at < 0) {
    throw new Error('This CSV needs tweet_id, text and created_on columns.');
  }
  return rows.map((row) => {
    // '2026-11-11 17:10:06+00:00' -> ISO, which every browser parses.
    const at = Date.parse((row[column.at] ?? '').trim().replace(' ', 'T'));
    const id = (row[column.id] ?? '').trim();
    if (!id || Number.isNaN(at)) return null;
    const text = decode(row[column.text] ?? '').trim();
    const kind = CSV_KINDS[(row[column.kind] ?? '').trim().toLowerCase()];
    return {
      id: `x:${id}`,
      source: 'x',
      kind: kind ?? (text.startsWith(RETWEET_PREFIX) ? 'retweet' : 'tweet'),
      at,
      md: monthDay(at),
      text,
      url: STATUS_URL + id,
      rich: false
    };
  });
}

/** One Google Keep note from Takeout. Trashed notes are skipped. */
function fromKeep(note) {
  const usec = note?.createdTimestampUsec ?? note?.userEditedTimestampUsec;
  const at = Math.round(Number(usec) / USEC_PER_MS);
  if (!at || note.isTrashed) return null;
  const items = (note.listContent ?? []).map((item) => ({ text: item.text ?? '', done: !!item.isChecked }));
  return {
    id: `keep:${usec}`,
    source: 'keep',
    kind: items.length ? 'list' : 'note',
    at,
    md: monthDay(at),
    title: note.title || undefined,
    text: (note.textContent ?? '').trim(),
    items: items.length ? items : undefined,
    labels: (note.labels ?? []).map((label) => label.name).filter(Boolean),
    rich: true
  };
}

/** A .json file: a Keep note, or an array of posts. */
function fromJson(text) {
  const data = JSON.parse(text.replace(BOM, ''));
  if (Array.isArray(data)) return data.map(fromTweet);
  if ('createdTimestampUsec' in data || 'textContent' in data) return [fromKeep(data)];
  throw new Error('This JSON file is not a Keep note or a list of posts.');
}

/** Reads an archive or Takeout .zip: posts, Keep notes, the media index and reply context. */
async function fromZip(file, progress) {
  if (!canUnzip()) throw new Error(NO_UNZIP);
  const entries = await listZip(file);
  const isPosts = (name) => X_POSTS_ENTRY.test(name) || X_DELETED_ENTRY.test(name);
  const wanted = entries.filter((e) => isPosts(e.name) || KEEP_ENTRY.test(e.name));
  if (!wanted.length) {
    throw new Error('No posts or Keep notes found in this zip. Is it an X archive or a Google Takeout?');
  }

  const memories = [];
  for (const [i, entry] of wanted.entries()) {
    progress(`Unpacking ${entry.name.split('/').pop()} (${i + 1} of ${wanted.length})`);
    const text = await (await readZip(file, entry)).text();
    if (KEEP_ENTRY.test(entry.name)) {
      memories.push(...fromJson(text));
      continue;
    }
    const deleted = X_DELETED_ENTRY.test(entry.name);
    for (const raw of fromXScript(text)) {
      const memory = fromTweet(raw);
      if (memory) memories.push(deleted ? { ...memory, deleted: true } : memory);
    }
  }

  // Photos and videos: remember where each sits in the zip, by post.
  const archive = archiveKey(file);
  const files = new Map();
  for (const entry of entries) {
    const match = X_MEDIA_ENTRY.exec(entry.name);
    if (!match) continue;
    const id = `x:${match[3]}`;
    if (!files.has(id)) files.set(id, []);
    const { name, local, compressed, method, encrypted } = entry;
    files.get(id).push({ archive, name, local, compressed, method, encrypted });
  }
  for (const memory of memories) if (files.has(memory.id)) memory.files = files.get(memory.id);

  // Other people's posts that replies answer: the archive only has their text if they were liked.
  const parents = new Set(memories.map((m) => m.parent).filter(Boolean));
  const context = [];
  const likes = entries.find((e) => X_LIKES_ENTRY.test(e.name));
  if (likes && parents.size) {
    progress('Unpacking like.js');
    for (const { like } of fromXScript(await (await readZip(file, likes)).text())) {
      if (like?.tweetId && like.fullText && parents.has(like.tweetId)) {
        context.push({ id: like.tweetId, text: decode(like.fullText) });
      }
    }
  }

  return { memories, context, archive: files.size ? file : null };
}

/**
 * Reads export files into memories.
 * @param {File[]} files
 * @param {(status: string) => void} progress
 * @returns {Promise<{ memories: any[], context: { id: string, text: string }[], archives: File[], skipped: string[] }>}
 *   archives: the zips that hold photos and videos; skipped: messages for files that failed
 */
export async function readExports(files, progress) {
  const memories = [];
  const context = [];
  const archives = [];
  const skipped = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    try {
      progress(`Reading ${file.name}`);
      if (name.endsWith('.zip')) {
        const found = await fromZip(file, progress);
        memories.push(...found.memories);
        context.push(...found.context);
        if (found.archive) archives.push(found.archive);
      } else if (name.endsWith('.js')) memories.push(...fromXScript(await file.text()).map(fromTweet));
      else if (name.endsWith('.csv')) memories.push(...fromXCsv(await file.text()));
      else if (name.endsWith('.json')) memories.push(...fromJson(await file.text()));
      else throw new Error('Pick a .zip, .js, .csv or .json export.');
    } catch (err) {
      skipped.push(`${file.name}: ${err instanceof SyntaxError ? 'not a readable export' : err.message}`);
    }
  }
  return { memories: memories.filter(Boolean), context, archives, skipped };
}
