// Test-only database bootstrap.
//
// When DATABASE_URL is not already set, this provisions a throwaway,
// per-process SQLite database in the OS temp dir and pushes the Prisma
// schema to it. That keeps `npm test` green on a fresh clone with zero
// manual setup and zero shared state between test processes.
//
// Must be imported (not awaited) before anything that constructs a
// PrismaClient, because the schema's datasource URL is read from the
// environment.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.DATABASE_URL) {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'forty-test-db-'));
	process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
	try {
		execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
			cwd: repoRoot,
			stdio: 'pipe',
			timeout: 120000,
		});
	} catch (err) {
		console.error('[tests/setup-db] could not provision the test database:', err.message);
		throw err;
	}
}
