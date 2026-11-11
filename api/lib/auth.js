import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';

// Origins of the Tauri webviews. Android/Windows use http, iOS/macOS/Linux use the tauri: scheme.
export const TAURI_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost'
];
const DEV_ORIGIN = 'http://localhost:5173';
const APPLE_ORIGIN = 'https://appleid.apple.com';
// Apple allows a client secret to live for at most six months; a new one is made whenever an isolate starts.
const APPLE_SECRET_SECONDS = 150 * 86_400;
const HANDLE_DIGITS = 5;

// The Worker's own origin is always allowed: that is the web app, on 40.dogs.red, on a Preview URL, or locally.
export function allowedOrigins(env, req) {
  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...TAURI_ORIGINS, new URL(req.url).origin, DEV_ORIGIN, ...extra];
}

// Sign-in providers that have their secrets set. Each one is off until then:
//   Google:   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   Facebook: FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET
//   Apple:    APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 contents)
// Redirect URL to register with each provider: https://40.dogs.red/api/auth/callback/<provider>
export function enabledProviders(env) {
  return [
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && 'google',
    env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_PRIVATE_KEY &&
      'apple',
    env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET && 'facebook'
  ].filter(Boolean);
}

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const encodeJson = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));

// Apple's "client secret" is a short-lived JWT signed with the app's private key (ES256).
async function appleClientSecret(env, now = Date.now()) {
  const pem = env.APPLE_PRIVATE_KEY.replace(/-----[A-Z ]+-----|\\n|\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const issuedAt = Math.floor(now / 1000);
  const unsigned = [
    encodeJson({ alg: 'ES256', kid: env.APPLE_KEY_ID }),
    encodeJson({
      iss: env.APPLE_TEAM_ID,
      iat: issuedAt,
      exp: issuedAt + APPLE_SECRET_SECONDS,
      aud: APPLE_ORIGIN,
      sub: env.APPLE_CLIENT_ID
    })
  ].join('.');
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(signature)}`;
}

// A provider would hand over the person's real name and photo. On 40 nobody has to be themselves, so a new
// account gets a neutral handle instead; it can be changed on the You tab.
const anonymous = () => ({
  name: `anon${String(crypto.getRandomValues(new Uint32Array(1))[0]).slice(0, HANDLE_DIGITS)}`,
  image: null
});

async function socialProviders(env) {
  const enabled = enabledProviders(env);
  const providers = {};
  if (enabled.includes('google')) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      mapProfileToUser: anonymous
    };
  }
  if (enabled.includes('facebook')) {
    providers.facebook = {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      mapProfileToUser: anonymous
    };
  }
  if (enabled.includes('apple')) {
    providers.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: await appleClientSecret(env),
      mapProfileToUser: anonymous
    };
  }
  return providers;
}

async function buildAuth(env, req, origin) {
  const apple = enabledProviders(env).includes('apple') ? [APPLE_ORIGIN] : [];
  return betterAuth({
    database: env.DB,
    basePath: '/api/auth',
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [...allowedOrigins(env, req), ...apple],
    emailAndPassword: { enabled: true },
    socialProviders: await socialProviders(env),
    // Bearer tokens instead of cookies: cookies don't cross from a Tauri webview to your API domain.
    plugins: [bearer()]
  });
}

// One auth instance per public origin, kept for the life of the isolate. Building one is expensive: Better Auth
// reads the whole database schema when it starts, which would otherwise cost ~80 row reads on every request.
// The origin comes from the request, so the same build works on the custom domain, on every Preview URL and locally.
const instances = new Map();

export function createAuth(env, req) {
  const { origin } = new URL(req.url);
  if (!instances.has(origin)) {
    const building = buildAuth(env, req, origin);
    // A failed start (e.g. a malformed Apple key) must not stick for the life of the isolate.
    building.catch(() => instances.delete(origin));
    instances.set(origin, building);
  }
  return instances.get(origin);
}
