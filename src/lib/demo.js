// Demo mode: the whole API answered from sample data held in memory, so the app can be shown without an
// account. Nothing is sent or saved, and a reload starts it over. Loaded only when the demo is opened
// (#lib/api.js). The data set is ./demo.json, the same one `npm run seed:preview` loads into staging, and
// the answers have the shapes of the handlers in api/lib/routes.js and api/lib/memories.js.
import { MIN_COHORT, addDays, habitKey, percentile, recordText, streak } from '../../api/lib/records.js';
import DEMO from './demo.json';
import { today as localToday } from './dates.js';

const ME = 'Demo';
const EMAIL = 'demo@forty.test';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const COMMENT_GAP_MS = 600_000;
const HISTORY_DAYS = 75;
const CYCLE_DAY = 12; // the demo cycle always looks 12 days old, 28 to go
const CYCLE_DAYS = 40;
const PROFILE_WINDOW_DAYS = 30;
const VISIBILITIES = ['private', 'friends', 'public'];
const MEMORY_LIMITS = { chunks: 100, chunkChars: 700_000, totalChars: 10_000_000 };
const NOT_FOUND = 404;
const BAD_REQUEST = 400;

const personId = (name) => `demo-${name.toLowerCase()}`;
const newId = () => crypto.randomUUID();

function fail(message, status = BAD_REQUEST) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Same input, same output: the sample history looks identical every time.
function chance(seed) {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

let state = null;

function build() {
  const now = Date.now();
  const today = localToday();
  const cycleStart = now - CYCLE_DAY * DAY_MS;
  const fresh = {
    cycle: { startedAt: cycleStart, endsAt: cycleStart + CYCLE_DAYS * DAY_MS },
    wipeHabits: 'keep',
    people: new Map(),
    habits: [],
    logs: [],
    follows: new Set(DEMO.follows.map(([from, to]) => `${personId(from)}>${personId(to)}`)),
    posts: [],
    comments: []
  };
  for (const [name, region, habits] of DEMO.people) {
    const userId = personId(name);
    fresh.people.set(userId, { id: userId, name, region, bio: DEMO.bios[name] || '' });
    for (const [habitName, kind, visibility, rate] of habits) {
      const id = `${userId}-${habitKey(habitName)}`;
      fresh.habits.push({ id, userId, name: habitName, kind, visibility, createdAt: now - HISTORY_DAYS * DAY_MS });
      // Up to yesterday: today is left untracked so there is something to tap.
      for (let back = 1; back <= HISTORY_DAYS; back++) {
        const day = addDays(today, -back);
        fresh.logs.push({ habitId: id, userId, day, done: chance(`${id}:${day}`) < rate ? 1 : 0 });
      }
    }
  }
  DEMO.posts.forEach(([author, kind, body, hoursAgo, comments], i) => {
    const id = `demo-post-${i}`;
    const createdAt = now - hoursAgo * HOUR_MS;
    fresh.posts.push({ id, userId: personId(author), kind, body, createdAt });
    comments.forEach(([commenter, text], j) =>
      fresh.comments.push({
        id: `${id}-${j}`,
        postId: id,
        userId: personId(commenter),
        body: text,
        createdAt: createdAt + (j + 1) * COMMENT_GAP_MS
      })
    );
  });
  return fresh;
}

const me = () => state.people.get(personId(ME));
const nameOf = (userId) => state.people.get(userId)?.name || '';
const publicHabit = ({ id, name, kind, visibility, createdAt }) => ({ id, name, kind, visibility, createdAt });
const habitsOf = (userId) => state.habits.filter((h) => h.userId === userId);
const myHabit = (id) => habitsOf(me().id).find((h) => h.id === id) || fail('habit not found', NOT_FOUND);
// One habit's rows, newest first (what streak() expects).
const logsOf = (habitId) =>
  state.logs.filter((l) => l.habitId === habitId).sort((a, b) => (a.day < b.day ? 1 : -1));
const withAuthor = (post) => ({
  ...post,
  name: nameOf(post.userId),
  comments: state.comments.filter((c) => c.postId === post.id).length
});
const findPost = (id) => state.posts.find((p) => p.id === id) || fail('post not found', NOT_FOUND);

function getMe() {
  const { id, name, region, bio } = me();
  return {
    user: { id, name, email: EMAIL },
    region,
    bio,
    wipeHabits: state.wipeHabits,
    cycle: state.cycle,
    habits: habitsOf(id).map(publicHabit)
  };
}

function putMe({ body }) {
  const person = me();
  if (body.name !== undefined) person.name = String(body.name).trim() || fail('bad name');
  if (body.bio !== undefined) person.bio = String(body.bio).trim();
  person.region = body.region ?? person.region;
  state.wipeHabits = body.wipeHabits ?? state.wipeHabits;
  return { name: person.name, region: person.region, bio: person.bio, wipeHabits: state.wipeHabits };
}

function createHabit({ body }) {
  const name = String(body.name || '').trim() || fail('name is needed');
  if (habitsOf(me().id).some((h) => habitKey(h.name) === habitKey(name))) fail('you already track that');
  const habit = {
    id: newId(),
    userId: me().id,
    name,
    kind: body.kind,
    visibility: body.visibility || 'private',
    createdAt: Date.now()
  };
  state.habits.push(habit);
  return { habit: publicHabit(habit) };
}

function updateHabit({ params, body }) {
  const habit = myHabit(params.id);
  Object.assign(habit, {
    name: body.name === undefined ? habit.name : String(body.name).trim() || fail('bad name'),
    kind: body.kind ?? habit.kind,
    visibility: body.visibility ?? habit.visibility
  });
  return { habit: publicHabit(habit) };
}

function deleteHabit({ params }) {
  const habit = myHabit(params.id);
  state.logs = state.logs.filter((l) => l.habitId !== habit.id);
  state.habits = state.habits.filter((h) => h !== habit);
  return { ok: true };
}

const mine = (log) => log.userId === me().id;
const logRow = ({ habitId, day, done }) => ({ habitId, day, done });

function getLogs({ query }) {
  const [from, to] = [query.get('from'), query.get('to')];
  return { logs: state.logs.filter((l) => mine(l) && l.day >= from && l.day <= to).map(logRow) };
}

function deleteDay({ params }) {
  state.logs = state.logs.filter((l) => !(mine(l) && l.day === params.day));
  return { ok: true };
}

function putDay({ params, body }) {
  const habits = habitsOf(me().id);
  if (!habits.length) fail('add something to track first');
  deleteDay({ params });
  const done = new Set(body.done);
  const logs = habits.map((h) => ({ habitId: h.id, userId: me().id, day: params.day, done: done.has(h.id) ? 1 : 0 }));
  state.logs.push(...logs);
  return { day: params.day, logs: logs.map(logRow) };
}

// How often each OTHER person who shares a habit with this name did it in a range. Never private habits.
function cohort(key, from, to) {
  return state.habits
    .filter((h) => habitKey(h.name) === key && h.visibility !== 'private' && h.userId !== me().id)
    .map((h) => {
      const logs = state.logs.filter((l) => l.habitId === h.id && l.day >= from && l.day <= to);
      return { region: state.people.get(h.userId).region, tracked: logs.length, done: logs.filter((l) => l.done).length };
    })
    .filter((o) => o.tracked)
    .map((o) => ({ region: o.region, rate: o.done / o.tracked }));
}

function getStats({ query }) {
  const month = query.get('month');
  const today = query.get('today');
  const year = month.slice(0, 4);
  const { region } = me();
  const count = (logs) => [logs.filter((l) => l.done).length, logs.length];
  return {
    month,
    region,
    minCohort: MIN_COHORT,
    habits: habitsOf(me().id).map((h) => {
      const logs = logsOf(h.id);
      const [monthDone, monthTracked] = count(logs.filter((l) => l.day.startsWith(month)));
      const [yearDone, yearTracked] = count(logs.filter((l) => l.day.startsWith(year)));
      const others = cohort(habitKey(h.name), `${month}-01`, `${month}-31`);
      const rates = (list) => (monthTracked ? percentile(monthDone / monthTracked, list.map((o) => o.rate)) : null);
      return {
        ...publicHabit(h),
        monthDone,
        monthTracked,
        yearDone,
        yearTracked,
        streak: streak(logs, h.kind, today),
        everyone: rates(others),
        local: region ? rates(others.filter((o) => o.region === region)) : null
      };
    })
  };
}

const getFeed = () => ({
  posts: [...state.posts].sort((a, b) => b.createdAt - a.createdAt).map(withAuthor),
  cycle: state.cycle
});

function recordBody(body) {
  const habit = myHabit(body.habitId);
  const logs = logsOf(habit.id);
  const week = logs.filter((l) => l.day > addDays(body.today, -7) && l.day <= body.today);
  const text = recordText(habit, body.share, {
    streakDays: streak(logs, habit.kind, body.today),
    weekDone: week.filter((l) => l.done).length,
    weekTracked: week.length
  });
  return text || fail('nothing to share yet: track a few days first');
}

function createPost({ body }) {
  const kind = body.habitId ? 'record' : 'text';
  const content = kind === 'record' ? recordBody(body) : String(body.body || '').trim() || fail('write something first');
  const post = { id: newId(), userId: me().id, kind, body: content, createdAt: Date.now() };
  state.posts.push(post);
  return { post: withAuthor(post) };
}

function getPost({ params }) {
  const post = findPost(params.id);
  const comments = state.comments
    .filter((c) => c.postId === post.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ postId, ...comment }) => ({ ...comment, name: nameOf(comment.userId) }));
  return { post: withAuthor(post), comments };
}

function deletePost({ params }) {
  const post = findPost(params.id);
  if (post.userId !== me().id) fail('post not found', NOT_FOUND);
  state.comments = state.comments.filter((c) => c.postId !== post.id);
  state.posts = state.posts.filter((p) => p !== post);
  return { ok: true };
}

function createComment({ params, body }) {
  const post = findPost(params.id);
  const content = String(body.body || '').trim() || fail('write something first');
  const comment = { id: newId(), postId: post.id, userId: me().id, body: content, createdAt: Date.now() };
  state.comments.push(comment);
  return { comment: { id: comment.id, userId: comment.userId, body: content, createdAt: comment.createdAt, name: me().name } };
}

function deleteComment({ params }) {
  state.comments = state.comments.filter((c) => !(c.id === params.id && c.userId === me().id));
  return { ok: true };
}

function getPerson({ params, query }) {
  const person = state.people.get(params.id) || fail('person not found', NOT_FOUND);
  const today = query.get('today');
  const following = state.follows.has(`${me().id}>${person.id}`);
  const followsYou = state.follows.has(`${person.id}>${me().id}`);
  const isSelf = person.id === me().id;
  const visible = isSelf ? VISIBILITIES : following && followsYou ? ['friends', 'public'] : ['public'];
  const windowStart = addDays(today, -PROFILE_WINDOW_DAYS);
  return {
    person: { id: person.id, name: person.name },
    bio: person.bio,
    isSelf,
    following,
    followsYou,
    windowDays: PROFILE_WINDOW_DAYS,
    habits: habitsOf(person.id)
      .filter((h) => visible.includes(h.visibility))
      .map((h) => {
        const logs = logsOf(h.id);
        const recent = logs.filter((l) => l.day > windowStart);
        return {
          id: h.id,
          name: h.name,
          kind: h.kind,
          visibility: h.visibility,
          streak: streak(logs, h.kind, today),
          recentDone: recent.filter((l) => l.done).length,
          recentTracked: recent.length
        };
      })
  };
}

function follow({ params }) {
  if (!state.people.has(params.id)) fail('person not found', NOT_FOUND);
  state.follows.add(`${me().id}>${params.id}`);
  return { following: true };
}

function unfollow({ params }) {
  state.follows.delete(`${me().id}>${params.id}`);
  return { following: false };
}

// [method, path with :params, handler]: the same table as ROUTES in api/lib/routes.js.
const DEMO_ROUTES = [
  ['GET', '/api/me', getMe],
  ['PUT', '/api/me', putMe],
  ['POST', '/api/habits', createHabit],
  ['PUT', '/api/habits/:id', updateHabit],
  ['DELETE', '/api/habits/:id', deleteHabit],
  ['GET', '/api/logs', getLogs],
  ['PUT', '/api/days/:day', putDay],
  ['DELETE', '/api/days/:day', deleteDay],
  ['GET', '/api/stats', getStats],
  ['GET', '/api/feed', getFeed],
  ['POST', '/api/posts', createPost],
  ['GET', '/api/posts/:id', getPost],
  ['DELETE', '/api/posts/:id', deletePost],
  ['POST', '/api/posts/:id/comments', createComment],
  ['DELETE', '/api/comments/:id', deleteComment],
  ['GET', '/api/people/:id', getPerson],
  ['POST', '/api/people/:id/follow', follow],
  ['DELETE', '/api/people/:id/follow', unfollow],
  // Memories stay on the device as always; the demo account has no backup to keep them in.
  ['GET', '/api/memories', () => ({ chunks: [], limits: MEMORY_LIMITS })]
];

function matchPath(pattern, pathname) {
  const want = pattern.split('/');
  const have = pathname.split('/');
  if (want.length !== have.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(have[i]);
    else if (want[i] !== have[i]) return null;
  }
  return params;
}

/**
 * The demo's stand-in for api() in #lib/api.js.
 * @param {string} path e.g. '/api/logs?from=2026-11-01&to=2026-11-31'
 * @param {{ method?: string, json?: object }} [init]
 * @returns {Promise<object>} what the Worker would answer; throws Error(message) with a status
 */
export async function demoApi(path, { method = 'GET', json = {} } = {}) {
  state ??= build();
  const url = new URL(path, location.origin);
  for (const [verb, pattern, handler] of DEMO_ROUTES) {
    const params = verb === method ? matchPath(pattern, url.pathname) : null;
    if (params) return structuredClone(handler({ params, query: url.searchParams, body: json }));
  }
  return fail('The demo keeps nothing on a server.');
}
