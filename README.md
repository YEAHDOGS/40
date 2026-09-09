# 40Forty - a temporary social media

Everything deletes itself every forty days

# What is this?

40Forty is a new kind of social media with an emphasis on temporary expression. Every 40 days, all posts, comments, images, videos, everything is deleted permanently, with no way of recovery. Only users and stat data remain.

Our terms of service prevent exporting anything from the website anywhere externally, whether it be screenshots or word of mouth. Anonymity and privacy is imperative to us, but so is spam filtering and delivering a premium bot-free experience. We long for the days when Reddit could be trusted, when it wasn't a dead internet bot farm spamming Amazon affiliate links. 40Forty uses a strict balance of verification and anonymity to allow humans to be human again. Express honest opinion without fear of cancel culture, brands against honest product reviews, or censorship.

# The Wipe

The 40-day cycle is the product, not a background job. `WIPE_INTERVAL_DAYS = 40`
in `src/server/wipe.js` is the single source of truth — the countdown, the API,
and the scheduler all derive from it.

- **What dies:** posts, replies, reposts, likes, media, hashtags, notifications.
- **What lives:** users, follows, game scores (stat data), and the wipe history itself.
- **It can't be skipped:** the `nextWipe` query lazy-wipes — ask for the countdown
  and an overdue purge runs first. `scripts/wipe-check.js --execute` is the cron
  backstop for production.
- **It can't be triggered by a visitor:** `triggerWipe` requires auth PLUS an
  admin allowlist entry (`FORTY_ADMIN_IDS` / `FORTY_ADMIN_USERNAMES` — deny by
  default), and the Timer component no longer fires it from the browser.

Full contract: [docs/wipe-architecture.md](docs/wipe-architecture.md).

# Password hashing (server)

`src/server/password.js` hashes passwords with **scrypt** (N=16384, r=8, p=1,
64-byte key, 16-byte salt) from `node:crypto` — stdlib only, zero new
dependencies.

```js
import { hashPassword, verifyPassword } from './src/server/password.js';

const stored = await hashPassword('hunter2'); // 'scrypt$N16384r8p1$<salt>$<key>'
await verifyPassword('hunter2', stored);      // true
await verifyPassword('wrong', stored);       // false
await verifyPassword('hunter2', 'garbage');  // false — fails closed, never throws
```

Rules of the road:

- `hashPassword` **throws** on empty/non-string input — reject blank passwords
  at the API boundary, don't silently hash them.
- `verifyPassword` **returns false, never throws** on malformed stored values —
  a corrupt row fails closed instead of 500ing.
- Comparison is constant-time (`timingSafeEqual`); `verifyPassword` always
  costs a full scrypt pass on well-formed input so correct and wrong passwords
  look alike to a stopwatch.

This module is wired into both auth surfaces:

- **REST:** `POST /auth/signup` hashes with `hashPassword` and stores it in a
  new `passwordHash` column on the User model; `POST /auth/login` requires
  the password and verifies it with `verifyPassword`. Hashless legacy rows
  fail closed (401), all failures return the same generic `Invalid credentials`,
  and the hash is stripped from every API response (`sanitizeUser`).
- **GraphQL:** the `signUp`/`login` resolvers do the same — signup hashes the
  password (blank passwords rejected, duplicate username/email gets a clean
  error instead of a Prisma 500), login verifies with `verifyPassword` and
  fails closed on unknown users, hashless legacy rows, and wrong passwords
  with the same generic `Invalid credentials`. The `passwordHash` is also
  stripped from resolver returns, and `scripts/fix-graphql.js` strips it from
  the generated GraphQL schema on every regeneration so it can never leak
  through the API schema.

# Security posture

These invariants are enforced in code and covered by regression tests
(`tests/graphql-content-auth.test.js`, `tests/graphql-validation.test.js`,
`tests/graphql-wipe-admin.test.js`, `tests/validation.test.js`,
`tests/api.test.js`, `tests/rate-limit.test.js`, `tests/auth-guard.test.js`,
`tests/client-ip.test.js`, `tests/audit.test.js`).
Any change that weakens one must update the tests and
this section together.

**Authentication & authorization**
- The app is login-gated by design: **every data-returning query and content
  read requires a valid token** — GraphQL `post`, `homeTimeline`,
  `recommendedTimeline`, `trends` and REST `GET /posts`, `GET /posts/:id`,
  `GET /users/:username` all return `UNAUTHORIZED`/`401` to anonymous
  callers. `nextWipe` is the only public query (it returns a bare timestamp,
  no user data).
- All mutations except `signUp`/`login` require a token (`requireAuth`
  wrapper in `src/server/resolvers.js`); authorship (`authorId`) always comes
  from the token, never from client input.
- `triggerWipe` purges all platform content, so it needs a token PLUS an
  admin allowlist entry (`FORTY_ADMIN_IDS` / `FORTY_ADMIN_USERNAMES`) —
  deny-by-default when neither is set.
- Every authz denial is audit-logged (`src/server/audit.js`): each
  `UNAUTHORIZED` / `FORBIDDEN` on the GraphQL and REST surfaces emits one
  JSON line (`{"audit": true, "event": "authz.denied", ...}`) with the
  operation name, surface, caller `userId`, resolved client IP, and timestamp
  — token-guessing, admin-endpoint poking, and cross-user writes now leave a
  parseable trail. Tokens are never logged (no `token` field exists) and the
  emit is best-effort so a logging failure can never turn a clean denial
  into a 500.

**Input validation** (`src/server/validation.js`, shared by GraphQL + REST)
- Every public mutation validates input at the boundary: string type +
  length caps (username 3–30, password 8–128, post content ≤2000, bio ≤500,
  media ≤4 items / URL ≤2048, hashtags ≤10), email format check, and strict
  enum allowlists (media type: `IMAGE`/`VIDEO`/`GIF`).
- Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are
  rejected recursively in any payload; validators take the RAW payload and
  check it BEFORE destructuring so smuggled keys can't be silently dropped.
- `updateProfile` never spreads caller input into Prisma — it uses an
  allowlisted field set with length caps.
- `ValidationError` maps to a 400 (REST) / GraphQL validation error, never a
  500.

**Secrets & hashes**
- Passwords are scrypt-hashed (see "Password hashing" above); the plaintext
  password is never logged (the REST signup debug log redacts it) and
  `passwordHash` is stripped from every API response (`sanitizeUser`) and
  from the generated GraphQL schema (`scripts/fix-graphql.js`).
- Auth failures (unknown user, hashless legacy row, wrong password) all
  return the same generic `Invalid credentials` — no user enumeration.

**Brute-force hardening** (`src/server/rate-limit.js`, shared by GraphQL + REST)
- Sliding-window rate limits on the public auth endpoints: login is capped
  per client IP (20/min) and per account (5/min); signup is capped per IP
  (15/min). Over-limit callers get `429` with a `Retry-After` header and a
  `{ error, retryAfterSeconds }` body (GraphQL: `RATE_LIMITED` extension
  code) instead of reaching the credential check.
- Account lockout: 5 consecutive failed logins for a real account lock it
  for 15 minutes (`ACCOUNT_LOCKED` / `429 "temporarily locked"`). A success
  resets the count and stale failures stop counting, so normal users are
  never locked; failures for unknown usernames are not recorded (recording
  them would let an attacker pre-lock an account before its owner registers).
- All limits are tunable via `FORTY_*` env vars (`FORTY_LOGIN_IP_LIMIT`,
  `FORTY_LOGIN_ACCOUNT_LIMIT`, `FORTY_SIGNUP_IP_LIMIT`,
  `FORTY_LOCKOUT_MAX_FAILS`, `FORTY_LOCKOUT_MS`, plus `..._WINDOW_MS`
  variants); garbage values fall back to the safe defaults. State is
  in-memory and memory-bounded (expired buckets are swept).
- **Rate-limit identity can't be forged:** client IP is resolved by
  `src/server/client-ip.js`, which honors `X-Forwarded-For` / `X-Real-IP`
  only when `TRUST_PROXY=1` is set (the app sits behind a proxy you control
  that sanitizes them). Default is the direct transport address (`unknown`
  when the transport gives nothing) — otherwise an attacker could rotate a
  forged header per request and mint a fresh per-IP budget each time.

# Features

- All content is blocked and hidden from non-users. This is a privacy-first social media
- New User Accounts require id verification and a valid, unique credit card
- Premium accounts get access to random chat (with gender and location filters)
- Premium accounts get access to messages
- Free accounts get limited posting and commenting functionality. Users can decide if they want their content visible to free accounts
- While freedom of speech is imporant to us, certain content that goes against our terms of service, like gore, will be IP banned
- Pixel art multiplayer creator
- Multiplayer games
- Web, Android, iOS, Desktop
- Music sharing and hosting, playlist sharing and stats, live listening dj sets and watch party chatrooms
- 3D virtual world rooms, with full customization and designer economy
- Dating
- Forty Marketplace
- Ad free, we do not serve or host advertisements. Nothing in feed, no banners
- Forty Map, to see nearby events, people, and places


## License

MIT — see [LICENSE](LICENSE).
