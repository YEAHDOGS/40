# 40Forty Wipe Architecture

> "Everything deletes itself every forty days."

This document is the technical contract behind that sentence: what "deletes
itself" means, what survives, and how the countdown can never lie.

## The promise

Every 40 days, all user-generated **content** is permanently destroyed with no
way of recovery. Users and stat data remain. The wipe is not a feature flag or
a soft-delete — rows are `deleteMany`'d, and the design intent is that backups,
caches, and object-storage blobs go with them (see "What 'permanent' requires"
below).

## The 40-day cycle

One source of truth: `WIPE_INTERVAL_DAYS = 40` in `src/server/wipe.js`. The
countdown UI, the GraphQL API, the cron backstop, and the tests all derive from
it — the interval cannot drift between layers.

State lives in the `WipeCycle` table (Prisma), one row per epoch:

| field       | meaning                                              |
|-------------|------------------------------------------------------|
| cycleNumber | 1, 2, 3… — the epoch counter                        |
| startedAt   | when this 40-day window began                        |
| wipedAt     | when the purge actually ran (null until it does)     |
| purgedPosts / purgedMedia | audit counts — stat data, so they survive |

Because the cycle is a database row (not module memory), the countdown survives
server restarts — the old in-memory `globalNextWipe` reset the clock on every
deploy.

### The lazy wipe

`nextWipe` (GraphQL) does not just read a date. It calls
`getNextWipe(prisma)`, which:

1. Ensures a cycle exists (creates cycle #1 anchored to `FORTY_WIPE_ANCHOR` or
   server start).
2. If `now - startedAt >= 40 days`, runs `purgeEphemeralContent()`, closes the
   old cycle (recording `wipedAt` + purge counts), and opens the next one —
   anchored to the **grid** (`oldStart + 40d`), so a late wipe never drifts the
   cadence.
3. Returns the next wipe date.

Consequence: the wipe cannot be skipped because no scheduler was running. The
moment anyone — the Timer component, a user, the cron script — asks "when is
the wipe?", an overdue wipe executes first. `scripts/wipe-check.js` (`--execute`)
is the cron backstop for production, where the dev-server GraphQL endpoint may
not exist.

### Manual trigger

`triggerWipe` is the auth-required escape hatch (admin use, incident response).
It purges immediately and restarts the 40-day clock **now**, breaking grid
alignment deliberately — a human chose this moment.

## What dies, what lives

**Deleted** (content — gone forever):

- posts, including replies and reposts (threads die with their roots)
- likes, media rows, hashtags and post↔hashtag links
- notifications (they point at content that no longer exists)

**Survives** (identity + stat data):

- users — accounts, profiles, verification status
- follows — the social graph is about people, not content
- game scores — arcade stats are explicitly "stat data" per the README
- wipe cycle history — the audit trail of what was destroyed, and when

**Open design questions** (flagged for Brandon, not decided here):

- Should follows survive? Keeping them preserves community across wipes; deleting
  them makes each cycle a true fresh start. Currently they survive.
- Should DMs / random-chat history exist at all, given the wipe? If added, they
  must be in the purge list from day one.

## What "permanent" requires

Row deletion is necessary but not sufficient. A production wipe must also:

1. **Object storage** — media blobs (R2/S3) must be deleted alongside rows.
   `purgeEphemeralContent()` collects the URLs first; the blob-deletion hook is
   marked TODO where the storage client will live.
2. **Backups** — database backups must rotate faster than 40 days, or a restore
   resurrects "deleted" content. Recommended: 30-day backup retention, tested
   restores, and a documented "no restores across wipe boundaries" policy.
3. **Caches/CDN** — purge CDN cache for media URLs at wipe time; set
   `Cache-Control: max-age` well under the cycle length.
4. **Logs** — access logs must not retain post bodies. Log IDs and timestamps,
   never content.
5. **Client caches** — the frontend should drop its urql cache and IndexedDB
   (if added) on wipe detection. The Timer already re-poll `nextWipe`; a
   `wiped` flag in that response (already returned server-side) can trigger a
   client-side cache clear — wired as a follow-up.

## UX of impermanence

The wipe is the product's emotional core, not just a janitor job:

- **The Timer is the brand.** The global countdown should be ambient and
  unavoidable — it's the one UI element every other social network lacks.
  Consider: a "last 24 hours" mode (accelerating tick, color shift), and a
  "final hour" state.
- **Posting with an expiry date changes writing.** Surface "dies in N days"
  on the composer so ephemerality is felt at creation time, not just at death.
- **The wipe moment should be a ritual, not a 500.** A shared "the feed is
  empty, say something first" empty-state after each wipe turns deletion into
  community rhythm.
- **No export.** The README already bans screenshots/exports in the ToS. The
  client should avoid making export trivial (no "download your data" button —
  deliberately), while acknowledging this is social-contract enforcement, not
  DRM.

## Failure modes

| failure | mitigation |
|---------|------------|
| wipe runs twice (two servers) | `WipeCycle.cycleNumber` is unique; second opener fails or no-ops on the already-closed cycle |
| wipe crashes midway | `wipedAt` stays null → next `nextWipe` call retries the purge; deletes are idempotent `deleteMany`s |
| clock skew | 40-day granularity makes skew irrelevant; grid anchoring absorbs it |
| media blob deletion fails | rows are the source of truth for "deleted"; retry blob cleanup from the collected URL list (TODO) |
