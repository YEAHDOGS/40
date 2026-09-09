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
- **It can't be triggered by a visitor:** `triggerWipe` requires auth, and the
  Timer component no longer fires it from the browser.

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

This module was staged for the REST auth fix — and the fix is now wired in:
`POST /auth/signup` hashes with `hashPassword` and stores it in a new
`passwordHash` column on the User model, and `POST /auth/login` requires
the password and verifies it with `verifyPassword`. Hashless legacy rows
fail closed (401), all failures return the same generic `Invalid credentials`,
and the hash is stripped from every API response (`sanitizeUser`). Note the
GraphQL `signUp`/`login` resolvers still don't check credentials — that's the
next hole to close.

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
