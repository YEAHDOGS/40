# 40

Track any habit. Share what you choose. Everything public is deleted every 40 days.

_Created by DOGS._

- **Habits**: anything you want to quit (drinking, weed, doomscrolling) or build (running, yoga, a
  cereal streak). Open a day on the calendar and tap what you did.
- **Yours first**: every habit is private, friends-only (people who follow each other) or public. Private
  habits never leave your account, not even inside anonymous comparisons.
- **Stats**: streaks, month and year totals, and how you compare with everyone else who shares the same
  habit, overall and in your state. Comparisons only appear once enough people share a habit.
- **The feed**: posts, comments and shared records ("75 days in a row"). Every 40 days all of it is
  deleted. Accounts, follows and your private records stay.

## Stack

| Layer         | Tool                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| UI            | Svelte 5 + SvelteKit (static SPA), plain JavaScript, Tailwind CSS v4      |
| Native shells | Tauri v2 (Windows, macOS, Linux, Android, iOS)                            |
| Backend       | One Cloudflare Worker (no framework): serves the web app **and** `/api/*` |
| Data          | Cloudflare D1 (SQL migrations in `worker/migrations/` are the schema)     |
| Users         | Better Auth: email + password, plus Google / Apple / Facebook             |

```
src/routes/     screens: / (track), /stats, /feed, /post, /person, /you
src/lib/        api.js, auth.js, app.svelte.js (session state), dates.js, components/
src/tauri/      native shell
worker/         index.js (entry), api.js (routes), records.js (streaks, comparisons),
                cycle.js (the 40-day wipe), limits.js (free-tier guard), preview.js, auth.js
scripts/        deploy.js + preview.js (Workers Builds), seed-preview.js, build.js (native builds)
landing/        the marketing site (GitHub Pages, separate from the app)
```

## Run it locally

Needs Node 24+ and pnpm. Native builds also need Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
cp .env.example .env        # set BETTER_AUTH_SECRET
pnpm db:migrate:local       # once: creates the local D1 database
pnpm build                  # the Worker serves dist/web
pnpm dev:api                # Worker + app on http://localhost:8787
pnpm dev                    # or: Vite on http://localhost:5173 with hot reload (proxies /api)
pnpm test && pnpm lint
```

Native apps: `pnpm build:desktop`, `pnpm build:android`, `pnpm build:ios` (see
[docs/BUILDING.md](docs/BUILDING.md)). They call the API at `PUBLIC_API_URL` from `.env`.

## Deploys

The Worker `40` is connected to this repository through Cloudflare Workers Builds.

- **Production** (<https://40.dogs.red>): every push to `master` runs `node scripts/deploy.js`: build,
  migrate the production database, deploy. Never deploy production by hand.
- **Previews**: every other branch runs `node scripts/preview.js` and gets its own Worker Preview on the
  **staging** database, which only ever holds dummy data. A Preview has one way in: the demo account, with
  the Preview password (the `PREVIEW_PASSWORD` secret of the Previews base config). `pnpm seed:preview`
  resets staging to the dummy data set.

Migrations must be additive: staging is shared by all Previews, and production briefly runs old code on
the new schema during a deploy.

## Sign-in providers

Each provider turns on by itself once its secrets exist (`pnpm wrangler secret put <NAME>`); the redirect
URL to register is `https://40.dogs.red/api/auth/callback/<provider>`.

| Provider | Secrets                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| Google   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                  |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`                                              |
| Apple    | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8) |

A provider's name and photo are never copied: new accounts get a neutral handle. Providers are offered
on the web app only for now; the native apps use email + password.

## Free-tier guard

`worker/limits.js` keeps the Worker inside Cloudflare's free allowances. It meters real usage (requests,
D1 rows read and written, database size) and, when the day's budget is spent, answers 503 "resting" until
midnight UTC instead of running up a bill or starving the other Workers on the account. One address is
also limited to 120 requests a minute.

`FREE_TIER_SHARE` in `worker/wrangler.jsonc` is the fraction of the account's daily allowance this Worker
may use. Once there are paying users, set `FREE_TIER_GUARD` to `"off"`; the file header lists what to
delete to remove it completely.
