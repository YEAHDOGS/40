/**
 * Regression: the production frontend build must never require server secrets.
 *
 * vite.config.js used to statically import the GraphQL dev plugin, which
 * pulled in src/server/auth.js at config-load time. auth.js resolves the JWT
 * secret at import time and fatals under NODE_ENV=production without one, so
 * `npm run build` died unless JWT_SECRET was set — and a second latent issue
 * (a comment-only time.graphql breaking the schema merge, and a duplicate
 * `client` declaration in Timer.svelte) meant the build was broken regardless.
 *
 * This test runs the real production build with JWT_SECRET explicitly unset
 * and asserts it succeeds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production build succeeds with JWT_SECRET unset', { timeout: 180000 }, async () => {
	const env = { ...process.env, NODE_ENV: 'production' };
	delete env.JWT_SECRET;
	await new Promise((resolve, reject) => {
		execFile('npm', ['run', 'build'], { cwd: repoRoot, env }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`vite build failed without JWT_SECRET:\n${stdout}\n${stderr}`));
				return;
			}
			resolve();
		});
	});
	assert.ok(true, 'build completed without a production secret');
});
