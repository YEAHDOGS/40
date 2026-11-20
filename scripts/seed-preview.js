// npm run seed:preview: RESETS the staging database and fills it with dummy data, including the demo account
// that Previews sign in to (api/lib/preview.js). Everything here is synthetic. Hard-wired to staging
// (`--env preview`): there is deliberately no way to point it at production.
// Needs DEMO_PASSWORD in .dev.vars; it must match the Previews secret PREVIEW_PASSWORD. Created by DOGS.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { DEMO_EMAIL } from '../api/lib/preview.js';
import DEMO from '../src/lib/demo.json' with { type: 'json' };
import { addDays, habitKey, msToDay } from '../api/lib/records.js';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 75;
const CYCLE_DAY = 12; // the preview cycle always looks 12 days old, 28 to go
const CYCLE_DAYS = 40;
const SQL_FILE = join(tmpdir(), 'forty-seed-preview.sql');
const TABLES = [
  'comment',
  'post',
  'follow',
  'habit_log',
  'habit',
  'profile',
  'session',
  'account',
  'verification',
  'user',
  'usage'
];

// The dummy data set (shared with the app's demo mode, src/lib/demo.js):
//   people:  [name, region, habits: [name, kind, visibility, share of days done]]
//   posts:   [author, kind, body, hours ago, comments: [author, body]]
//   bios:    name -> bio;  follows: [follower, followee]
const { people: PEOPLE, posts: POSTS, bios: BIOS, follows: FOLLOWS } = DEMO;

if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error(
    'Set DEMO_PASSWORD in .dev.vars (the same value as the Previews secret PREVIEW_PASSWORD).'
  );
  process.exit(1);
}

const now = Date.now();
const today = msToDay(now);
const q = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, row) =>
  `insert into "${table}" (${Object.keys(row)
    .map((k) => `"${k}"`)
    .join(', ')}) values (${Object.values(row).map(q).join(', ')});`;
const id = (...parts) =>
  parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
// Same input, same output: the dummy data looks identical after every reset.
function chance(seed) {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const sql = TABLES.map((table) => `delete from "${table}";`);
const cycleStart = now - CYCLE_DAY * DAY_MS;
sql.push(
  `update "cycle" set "startedAt" = ${cycleStart}, "endsAt" = ${cycleStart + CYCLE_DAYS * DAY_MS} where "id" = 1;`
);

for (const [name, region, habits] of PEOPLE) {
  const userId = id('seed', name);
  const isDemo = name === 'Demo';
  const stamp = new Date(now - HISTORY_DAYS * DAY_MS).toISOString();
  sql.push(
    insert('user', {
      id: userId,
      name,
      email: isDemo ? DEMO_EMAIL : `${id(name)}@forty.test`,
      emailVerified: 0,
      image: null,
      createdAt: stamp,
      updatedAt: stamp
    })
  );
  sql.push(insert('profile', { userId, region, bio: BIOS[name] || null }));
  // Only the demo account can sign in; the others exist to make the feed and the comparisons real.
  if (isDemo) {
    sql.push(
      insert('account', {
        id: id('seed-account', name),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword(password),
        createdAt: stamp,
        updatedAt: stamp
      })
    );
  }
  for (const [habitName, kind, visibility, rate] of habits) {
    const habitId = id(userId, habitName);
    sql.push(
      insert('habit', {
        id: habitId,
        userId,
        name: habitName,
        key: habitKey(habitName),
        kind,
        visibility,
        createdAt: now - HISTORY_DAYS * DAY_MS
      })
    );
    // Up to yesterday: today is left untracked so there is something to tap.
    for (let back = 1; back <= HISTORY_DAYS; back++) {
      const day = addDays(today, -back);
      sql.push(
        insert('habit_log', {
          habitId,
          userId,
          day,
          done: chance(`${habitId}:${day}`) < rate ? 1 : 0
        })
      );
    }
  }
}
for (const [follower, followee] of FOLLOWS) {
  sql.push(
    insert('follow', {
      followerId: id('seed', follower),
      followeeId: id('seed', followee),
      createdAt: now
    })
  );
}
POSTS.forEach(([author, kind, body, hoursAgo, comments], i) => {
  const postId = id('seed-post', String(i));
  const createdAt = now - hoursAgo * 3_600_000;
  sql.push(insert('post', { id: postId, userId: id('seed', author), kind, body, createdAt }));
  comments.forEach(([commenter, text], j) => {
    sql.push(
      insert('comment', {
        id: id(postId, String(j)),
        postId,
        userId: id('seed', commenter),
        body: text,
        createdAt: createdAt + (j + 1) * 600_000
      })
    );
  });
});

writeFileSync(SQL_FILE, sql.join('\n'));
console.log(`Resetting staging with ${sql.length} statements...`);
const run = spawnSync(
  `npx --yes wrangler d1 execute forty-staging --remote --env preview --yes --file "${SQL_FILE}"`,
  {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  }
);
rmSync(SQL_FILE, { force: true });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`Done. Sign in to any Preview with the demo password (account ${DEMO_EMAIL}).`);
