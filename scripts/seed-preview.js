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

// [name, region, habits: [name, kind, visibility, share of days done]]
const PEOPLE = [
  [
    'Demo',
    'US-GA',
    [
      ['Drinking', 'quit', 'public', 0.3],
      ['Weed', 'quit', 'friends', 0.45],
      ['Running', 'build', 'public', 0.6],
      ['Yoga', 'build', 'friends', 0.35],
      ['Cinnamon Toast Crunch', 'build', 'public', 1],
      ['Doomscrolling', 'quit', 'private', 0.8]
    ]
  ],
  [
    'Mara',
    'US-GA',
    [
      ['Drinking', 'quit', 'public', 0.1],
      ['Running', 'build', 'public', 0.8],
      ['Weed', 'quit', 'public', 0.2]
    ]
  ],
  [
    'Dex',
    'US-GA',
    [
      ['Drinking', 'quit', 'public', 0.55],
      ['Running', 'build', 'public', 0.3],
      ['Lifting', 'build', 'public', 0.7]
    ]
  ],
  [
    'June',
    'US-GA',
    [
      ['Drinking', 'quit', 'public', 0.2],
      ['Yoga', 'build', 'public', 0.9],
      ['Cinnamon Toast Crunch', 'build', 'public', 0.4]
    ]
  ],
  [
    'Koa',
    'US-GA',
    [
      ['Drinking', 'quit', 'public', 0.7],
      ['Running', 'build', 'public', 0.5],
      ['Pickleball', 'build', 'public', 0.45]
    ]
  ],
  [
    'Ines',
    'US-CA',
    [
      ['Drinking', 'quit', 'public', 0.05],
      ['Running', 'build', 'public', 0.95],
      ['Weed', 'quit', 'public', 0.6]
    ]
  ],
  [
    'Theo',
    'US-NY',
    [
      ['Drinking', 'quit', 'public', 0.4],
      ['Running', 'build', 'public', 0.2],
      ['Cinnamon Toast Crunch', 'build', 'public', 0.9]
    ]
  ]
];
// [author, kind, body, hours ago, comments: [author, body]]
const POSTS = [
  [
    'Demo',
    'record',
    'Cinnamon Toast Crunch: 75 days in a row.',
    2,
    [
      ['Theo', 'respect. I broke mine at 31.'],
      ['Mara', 'this is the content I am here for']
    ]
  ],
  [
    'Mara',
    'text',
    'Day 9 without a drink. The evenings are the hard part, so I started running at 7pm instead.',
    5,
    [['Demo', 'the 7pm run is a good trick']]
  ],
  ['Dex', 'record', 'Lifting: 4 of the last 7 days.', 9, []],
  [
    'Ines',
    'text',
    'Reminder that all of this is gone in a few weeks. Say the true thing.',
    20,
    [
      ['June', 'needed that'],
      ['Koa', 'ok: I slipped last night. back at it today.']
    ]
  ],
  ['Koa', 'record', 'Clean from Drinking 3 of the last 7 days.', 30, [['Mara', 'three is three.']]],
  ['June', 'text', 'Yoga before work, every day this month. Anyone else doing mornings?', 50, []]
];
const BIOS = {
  Demo: 'The demo account. Everything here is made up.',
  Mara: 'Trading wine for miles.',
  Dex: 'Lifting, mostly. Honest about the rest.',
  Ines: 'Running since March.'
};
const FOLLOWS = [
  ['Demo', 'Mara'],
  ['Mara', 'Demo'],
  ['Demo', 'Dex'],
  ['Dex', 'Demo'],
  ['June', 'Demo'],
  ['Demo', 'Ines']
];

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
