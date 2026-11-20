// The site lock: while 40 is a work in progress, the whole API (and so every account, sign-in and sign-up)
// answers only to people who know the site password. Created by DOGS.
//
// The password is the SITE_PASSWORD secret (`npx wrangler secret put SITE_PASSWORD`; locally in .dev.vars),
// never a value in this repository. With no secret set, nothing unlocks: the lock fails closed.
// The app trades the password for a pass (POST /api/gate) and sends the pass with every request in the
// X-Forty-Gate header, so the password itself is never stored on a device. The pass is derived from the
// password, so changing the secret locks everyone out again.
// Without the pass the app offers its demo mode (src/lib/demo.js), which never calls the API.
// Previews are not behind this lock: their only way in is already the demo account's password (preview.js).
//
// OPENING THE DOORS: delete this file, its three uses in api/worker.js, and Lock.svelte's use in App.svelte.
import { isPreview } from './preview.js';
import { HttpError } from './routes.js';

export const GATE_PATH = '/api/gate';
export const GATE_HEADER = 'X-Forty-Gate';
export const LOCKED = { error: 'locked', message: 'locked', code: 'locked' };
// A provider sends the browser back here by itself, so the header cannot be there. It only completes a
// sign-in that was started with the pass (the state it checks is made by /api/auth/sign-in/social).
const OPEN_PATHS = ['/api/auth/callback/'];
const PASS_LABEL = 'forty-gate:';
const MAX_PASSWORD = 200;
// Guesses one address may make.
const TRIES_PER_MINUTE = 10;
const MINUTE_MS = 60_000;
const MAX_TRACKED_IPS = 5_000;

const tries = new Map();
const encoder = new TextEncoder();

/** @returns {Promise<string>} the pass a password unlocks: HMAC-SHA256 under the Worker's own secret, as hex */
async function passFor(env, password) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.BETTER_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(PASS_LABEL + password));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares every character, so the time taken says nothing about where two values differ.
function same(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}

function tooManyTries(req, now) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const minute = Math.floor(now / MINUTE_MS);
  const seen = tries.get(ip);
  if (!seen || seen.minute !== minute) {
    if (tries.size >= MAX_TRACKED_IPS) tries.clear();
    tries.set(ip, { minute, count: 1 });
    return false;
  }
  return ++seen.count > TRIES_PER_MINUTE;
}

export const gated = (env) => !isPreview(env);

/** POST /api/gate { password } -> { pass }. Throws 403 on a wrong password, 429 on too many guesses. */
export async function unlock(req, env, body, now = Date.now()) {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  if (tooManyTries(req, now)) throw new HttpError(429, 'Too many tries. Wait a minute.');
  const { password } = body;
  const known = env.SITE_PASSWORD && env.BETTER_AUTH_SECRET;
  if (!known || typeof password !== 'string' || !password || password.length > MAX_PASSWORD)
    throw new HttpError(403, 'Wrong password');
  const [offered, pass] = await Promise.all([passFor(env, password), passFor(env, env.SITE_PASSWORD)]);
  if (!same(offered, pass)) throw new HttpError(403, 'Wrong password');
  return { pass };
}

/** Whether a request may reach the API: it carries the pass, or it is a provider's own redirect. */
export async function unlocked(req, env, pathname) {
  if (OPEN_PATHS.some((path) => pathname.startsWith(path))) return true;
  const offered = req.headers.get(GATE_HEADER);
  if (!offered || !env.SITE_PASSWORD || !env.BETTER_AUTH_SECRET) return false;
  return same(offered, await passFor(env, env.SITE_PASSWORD));
}
