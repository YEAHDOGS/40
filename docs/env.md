# 40Forty — Environment Configuration

The server fails fast on bad config. This doc lists every environment
variable, which are required where, and what happens when one is missing.

## Required in production (NODE_ENV=production)

| Variable | Purpose | If missing |
|---|---|---|
| `JWT_SECRET` | Signs auth JWTs | **FATAL — the server refuses to boot.** A big FATAL banner naming `JWT_SECRET` is printed to stderr, then the process crashes. This is intentional fail-closed behavior: tokens must never be signed with a fallback secret. |
| `DATABASE_URL` | Prisma database connection string | Prisma fails at first query; the server starts but the API cannot read or write. |

Generate a real secret with:

```sh
openssl rand -base64 48
```

**Staging checklist:** if the server crash-loops on staging, check the logs
first — the FATAL banner names the exact missing variable. Do not "fix" a
JWT_SECRET crash-loop by unsetting `NODE_ENV`; that just hides the missing
secret behind the dev-only fallback, which must never sign production
tokens.

## Optional

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` (in-memory fallback in dev) | Session cache for issued JWTs |
| `FORTY_WIPE_ANCHOR` | first server start | Pins the 40-day wipe cadence to a fixed ISO date |

## Development

Outside `NODE_ENV=production`, a missing `JWT_SECRET` falls back to a
hardcoded dev-only secret (`forty-dev-only-secret`) with a loud warning on
every boot. That fallback is never valid for staging or production traffic.

Copy `.env.example` to `.env` (gitignored) for local dev. Never commit real
values — `.env` is in `.gitignore`.
