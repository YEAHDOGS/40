// Workers Builds "Deploy command" for master: `node scripts/deploy.js`.
// Applies pending D1 migrations to production, then deploys the Worker (wrangler.jsonc builds the web app first). Migrations run
// before the deploy, so new code never meets an old schema; a failed step stops everything and production
// keeps running the previous version. Migrations must stay additive: the old Worker serves traffic on the
// new schema for the few seconds between the two steps. Created by DOGS.
import { spawnSync } from 'node:child_process';

const STEPS = [
  'npx --yes wrangler d1 migrations apply forty --remote',
  'npx --yes wrangler deploy'
];

for (const command of STEPS) {
  console.log(`> ${command}`);
  // CI=true makes Wrangler skip its confirmation prompt instead of waiting on stdin.
  const run = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
