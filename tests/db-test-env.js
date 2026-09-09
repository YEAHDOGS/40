// tests/db-test-env.js — zero-setup test database.
//
// Import this FIRST in any test file that touches Prisma:
//
//   import './db-test-env.js';
//
// Why: the schema reads its URL from env("DATABASE_URL"). Without this
// helper, `npm test` dies on a fresh clone because there is no .env.
// With it, each test process gets its own throwaway SQLite file and the
// tables are pushed automatically — no setup, no .env required.
// If DATABASE_URL is already set, this module does nothing (CI / dev keep
// their own database).
//
// NOTE: like any sqlite-backed test, this must NOT run against a real
// database. `db push --accept-data-loss` only ever targets the temp file
// created above.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.DATABASE_URL) {
	const dbFile = join(
		tmpdir(),
		`forty-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`
	);
	process.env.DATABASE_URL = `file:${dbFile}`;

	try {
		execFileSync('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], {
			stdio: 'pipe',
			timeout: 120000
		});
	} catch (err) {
		const detail = err?.stderr?.toString() || err?.message || String(err);
		console.error(`[db-test-env] prisma db push failed: ${detail}`);
		process.exitCode = 1;
		throw err;
	}

	// Leave no trace: delete the throwaway DB when this process exits.
	process.on('exit', () => {
		for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`]) {
			try {
				rmSync(f, { force: true });
			} catch {
				/* best effort */
			}
		}
	});
}
