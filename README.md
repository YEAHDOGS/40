# 40

Track any habit. Share what you choose. Everything public is deleted every 40 days.

_Made by DOGS._

- **Habits**: anything you want to quit (drinking, weed, doomscrolling) or build (running, yoga, a
  cereal streak). Open a day on the calendar and tap what you did.
- **Yours first**: every habit is private, friends-only (people who follow each other) or public. Private
  habits never leave your account, not even inside anonymous comparisons.
- **Stats**: streaks, month and year totals, and how you compare with everyone else who shares the same
  habit, overall and in your state. Comparisons only appear once enough people share a habit.
- **The feed**: posts, comments and shared records ("75 days in a row").
- **The wipe**: every 40 days all posts and comments are deleted, for everyone. Accounts, profiles and
  follows stay. Each person chooses whether their own habits and tracked days are kept or deleted too.

## Stack

Vite, Svelte 5, Tailwind CSS v4, plain JavaScript with JSDoc, one Cloudflare Worker with D1, Better Auth,
and Tauri 2 for the native apps. Created from the DOGS Svelte template; the dependency list is kept to
the template's plus `@tauri-apps/*` and `better-auth`.

```
api/worker.js       Worker entry: serves dist/ and routes /api/*
api/lib/            routes.js (handlers), records.js (streaks, comparisons), cycle.js (the wipe),
                    limits.js (free-tier guard), preview.js, auth.js
api/migrations/     SQL migrations: the only schema source
src/App.svelte      the shell; src/views/ screens, src/components/, src/lib/, src/styles/ (all colors)
src/tauri/          native shell
scripts/            deploy.js + preview.js (Workers Builds), seed-preview.js
landing/            the marketing site (GitHub Pages, separate from the app)
wrangler.jsonc      Worker config: top level = production, "previews" = pull request Previews
```

## Run it locally

Needs Node 24+. Native builds also need Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
npm install
cp .dev.vars.example .dev.vars        # set BETTER_AUTH_SECRET
npm run cloudflare:db:migrate:local   # once: creates the local D1 database
npm run dev                           # builds the app, then Worker + app on http://localhost:8788
npm run devVite                       # optional: Vite with hot reload on :5173 (proxies /api to :8788)
npm test
```

Native: `npm run tauri:dev`, `npm run tauri:build`; Android: `npx tauri android init` once, then
`npx tauri android build --apk`. Packaged apps call the API at `PRODUCTION_API` in `src/lib/api.js`.

## Deploys

The Worker `40` is connected to this repository through Cloudflare Workers Builds.

- **Production** (<https://40.dogs.red>): every push to `master` runs `node scripts/deploy.js`: migrate
  the production database, build, deploy. Never deploy production by hand.
- **Previews**: every other branch runs `node scripts/preview.js` and gets its own Worker Preview on the
  **staging** database, which only ever holds dummy data. A Preview has one way in: the demo account, with
  the Preview password (the `PREVIEW_PASSWORD` secret of the Previews base config). `npm run seed:preview`
  resets staging to the dummy data set.

Migrations must be additive: staging is shared by all Previews, and production briefly runs old code on
the new schema during a deploy.

## Sign-in providers

Email and password always work. Each provider turns on by itself once its secrets exist
(`npx wrangler secret put <NAME>`); register `https://40.dogs.red/api/auth/callback/<provider>` as the
redirect URL.

| Provider | Secrets                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| Google   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                  |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`                                              |
| Apple    | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8) |

A provider's name and photo are never copied: new accounts get a neutral handle. Providers are offered
on the web app only for now; the native apps use email and password.

## Free-tier guard

`api/lib/limits.js` keeps the Worker inside Cloudflare's free allowances. It meters real usage (requests,
D1 rows read and written, database size) and, when the day's budget is spent, answers 503 "resting" until
midnight UTC instead of running up a bill or starving the other Workers on the account. One address is
also limited to 120 requests a minute.

`FREE_TIER_SHARE` in `wrangler.jsonc` is the fraction of the account's daily allowance this Worker may
use. Once there are paying users, set `FREE_TIER_GUARD` to `"off"`; the file header lists what to delete
to remove it completely.
