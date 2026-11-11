// /api routes for signed-in users: habits, daily records, stats, the feed, people. Created by DOGS.
// Every handler receives { env, user, params, url, body } and returns plain data (sent as JSON).
import { getCycle } from './cycle.js';
import { MIN_COHORT, addDays, habitKey, isDay, percentile, recordText, streak } from './records.js';

const KINDS = ['quit', 'build'];
const VISIBILITIES = ['private', 'friends', 'public'];
const SHARES = ['streak', 'week'];
const MAX_HABITS = 30;
const MAX_NAME = 40;
const MAX_DISPLAY_NAME = 30;
const MAX_BODY = 500;
const MAX_REGION = 8;
const FEED_PAGE = 50;
const MAX_COMMENTS = 200;
const POSTS_PER_MINUTE = 5;
const STREAK_LOOKBACK_DAYS = 1500;
const PROFILE_WINDOW_DAYS = 30;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REGION_RE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}
const fail = (message, status = 400) => {
	throw new HttpError(status, message);
};

const rows = async (stmt) => (await stmt.all()).results;
const text = (value, max) =>
	typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
const day = (value) => (isDay(value) ? value : fail('bad day'));
// Range bounds only need the right shape: '2026-11-31' is a fine upper bound for a month.
const bound = (value) => (DAY_SHAPE_RE.test(value || '') ? value : fail('bad day'));

function groupBy(list, key) {
	const map = new Map();
	for (const item of list) map.set(item[key], [...(map.get(item[key]) || []), item]);
	return map;
}

const listHabits = (env, userId) =>
	rows(
		env.DB.prepare(
			'select "id", "name", "kind", "visibility", "createdAt" from "habit" where "userId" = ? order by "createdAt"'
		).bind(userId)
	);

async function ownHabit(env, user, id) {
	const habit = await env.DB.prepare('select * from "habit" where "id" = ? and "userId" = ?')
		.bind(id, user.id)
		.first();
	return habit || fail('habit not found', 404);
}

// ----- account ---------------------------------------------------------------------------------

async function getMe({ env, user }) {
	const [profile, cycle, habits] = await Promise.all([
		env.DB.prepare('select "region" from "profile" where "userId" = ?').bind(user.id).first(),
		getCycle(env),
		listHabits(env, user.id)
	]);
	return {
		user: { id: user.id, name: user.name, email: user.email },
		region: profile?.region || '',
		cycle,
		habits
	};
}

// Changes the optional region and, when given, the public display name.
async function putMe({ env, user, body }) {
	const name =
		body.name === undefined ? user.name : text(body.name, MAX_DISPLAY_NAME) || fail('bad name');
	const region = body.region === undefined ? null : body.region || '';
	if (name !== user.name) {
		await env.DB.prepare('update "user" set "name" = ? where "id" = ?').bind(name, user.id).run();
	}
	if (region === null) return { name };
	if (region && (region.length > MAX_REGION || !REGION_RE.test(region))) fail('bad region');
	await env.DB.prepare(
		'insert into "profile" ("userId", "region") values (?, ?) on conflict ("userId") do update set "region" = excluded."region"'
	)
		.bind(user.id, region || null)
		.run();
	return { name, region };
}

// ----- habits ----------------------------------------------------------------------------------

async function createHabit({ env, user, body }) {
	const name = text(body.name, MAX_NAME) || fail(`name must be 1-${MAX_NAME} characters`);
	if (!KINDS.includes(body.kind)) fail('bad kind');
	const visibility = body.visibility || 'private';
	if (!VISIBILITIES.includes(visibility)) fail('bad visibility');

	const habits = await listHabits(env, user.id);
	if (habits.length >= MAX_HABITS) fail(`you can track up to ${MAX_HABITS} habits`);
	if (habits.some((h) => habitKey(h.name) === habitKey(name))) fail('you already track that');

	const habit = {
		id: crypto.randomUUID(),
		name,
		kind: body.kind,
		visibility,
		createdAt: Date.now()
	};
	await env.DB.prepare(
		'insert into "habit" ("id", "userId", "name", "key", "kind", "visibility", "createdAt") values (?, ?, ?, ?, ?, ?, ?)'
	)
		.bind(habit.id, user.id, name, habitKey(name), habit.kind, visibility, habit.createdAt)
		.run();
	return { habit };
}

async function updateHabit({ env, user, params, body }) {
	const habit = await ownHabit(env, user, params.id);
	const name = body.name === undefined ? habit.name : text(body.name, MAX_NAME) || fail('bad name');
	const kind = body.kind ?? habit.kind;
	const visibility = body.visibility ?? habit.visibility;
	if (!KINDS.includes(kind)) fail('bad kind');
	if (!VISIBILITIES.includes(visibility)) fail('bad visibility');
	await env.DB.prepare(
		'update "habit" set "name" = ?, "key" = ?, "kind" = ?, "visibility" = ? where "id" = ?'
	)
		.bind(name, habitKey(name), kind, visibility, habit.id)
		.run();
	return { habit: { id: habit.id, name, kind, visibility, createdAt: habit.createdAt } };
}

// Deleting a habit deletes its whole history too.
async function deleteHabit({ env, user, params }) {
	const habit = await ownHabit(env, user, params.id);
	await env.DB.batch([
		env.DB.prepare('delete from "habit_log" where "habitId" = ?').bind(habit.id),
		env.DB.prepare('delete from "habit" where "id" = ?').bind(habit.id)
	]);
	return { ok: true };
}

// ----- daily records ---------------------------------------------------------------------------

async function getLogs({ env, user, url }) {
	const from = bound(url.searchParams.get('from'));
	const to = bound(url.searchParams.get('to'));
	const logs = await rows(
		env.DB.prepare(
			'select "habitId", "day", "done" from "habit_log" where "userId" = ? and "day" between ? and ?'
		).bind(user.id, from, to)
	);
	return { logs };
}

// Saving a day records EVERY habit for that day: done (1) for the ids in body.done, not done (0) for the rest.
async function putDay({ env, user, params, body }) {
	const date = day(params.day);
	if (!Array.isArray(body.done)) fail('done must be a list of habit ids');
	const done = new Set(body.done);
	const habits = await listHabits(env, user.id);
	if (!habits.length) fail('add something to track first');
	await env.DB.batch(
		habits.map((h) =>
			env.DB.prepare(
				'insert into "habit_log" ("habitId", "userId", "day", "done") values (?, ?, ?, ?) on conflict ("habitId", "day") do update set "done" = excluded."done"'
			).bind(h.id, user.id, date, done.has(h.id) ? 1 : 0)
		)
	);
	return {
		day: date,
		logs: habits.map((h) => ({ habitId: h.id, day: date, done: done.has(h.id) ? 1 : 0 }))
	};
}

async function deleteDay({ env, user, params }) {
	await env.DB.prepare('delete from "habit_log" where "userId" = ? and "day" = ?')
		.bind(user.id, day(params.day))
		.run();
	return { ok: true };
}

// ----- stats -----------------------------------------------------------------------------------

const recentLogs = (env, userId, today) =>
	rows(
		env.DB.prepare(
			'select "habitId", "day", "done" from "habit_log" where "userId" = ? and "day" >= ? order by "day" desc'
		).bind(userId, addDays(today, -STREAK_LOOKBACK_DAYS))
	);

// How often everyone else who SHARES a habit with the same name did it in a date range.
// Private habits are never read here.
async function cohortRates(env, user, keys, from, to) {
	if (!keys.length) return [];
	return rows(
		env.DB.prepare(
			`select h."key", p."region", sum(l."done") * 1.0 / count(*) as "rate"
			from "habit" h
			join "habit_log" l on l."habitId" = h."id"
			left join "profile" p on p."userId" = h."userId"
			where h."key" in (${keys.map(() => '?').join(', ')})
				and h."visibility" != 'private' and h."userId" != ? and l."day" between ? and ?
			group by h."key", h."userId"`
		).bind(...keys, user.id, from, to)
	);
}

async function getStats({ env, user, url }) {
	const month = url.searchParams.get('month');
	if (!MONTH_RE.test(month || '')) fail('bad month');
	const today = day(url.searchParams.get('today'));
	const [monthFrom, monthTo] = [`${month}-01`, `${month}-31`];
	const [yearFrom, yearTo] = [`${month.slice(0, 4)}-01-01`, `${month.slice(0, 4)}-12-31`];

	const habits = await listHabits(env, user.id);
	const keys = [...new Set(habits.map((h) => habitKey(h.name)))];
	const [totals, logs, cohort, profile] = await Promise.all([
		rows(
			env.DB.prepare(
				`select "habitId",
					sum(case when "day" between ?1 and ?2 then "done" else 0 end) as "monthDone",
					sum(case when "day" between ?1 and ?2 then 1 else 0 end) as "monthTracked",
					sum("done") as "yearDone", count(*) as "yearTracked"
				from "habit_log" where "userId" = ?3 and "day" between ?4 and ?5 group by "habitId"`
			).bind(monthFrom, monthTo, user.id, yearFrom, yearTo)
		),
		recentLogs(env, user.id, today),
		cohortRates(env, user, keys, monthFrom, monthTo),
		env.DB.prepare('select "region" from "profile" where "userId" = ?').bind(user.id).first()
	]);

	const totalsById = new Map(totals.map((t) => [t.habitId, t]));
	const logsById = groupBy(logs, 'habitId');
	const cohortByKey = groupBy(cohort, 'key');
	const region = profile?.region || '';

	return {
		month,
		region,
		minCohort: MIN_COHORT,
		habits: habits.map((h) => {
			const t = totalsById.get(h.id) || {
				monthDone: 0,
				monthTracked: 0,
				yearDone: 0,
				yearTracked: 0
			};
			const others = cohortByKey.get(habitKey(h.name)) || [];
			const rate = t.monthTracked ? t.monthDone / t.monthTracked : null;
			const compare = (list) =>
				rate === null
					? null
					: percentile(
							rate,
							list.map((o) => o.rate)
						);
			return {
				...h,
				...t,
				streak: streak(logsById.get(h.id) || [], h.kind, today),
				everyone: compare(others),
				local: region ? compare(others.filter((o) => o.region === region)) : null
			};
		})
	};
}

// ----- feed ------------------------------------------------------------------------------------

const POST_SELECT = `select p."id", p."userId", u."name", p."kind", p."body", p."createdAt",
	(select count(*) from "comment" c where c."postId" = p."id") as "comments"
	from "post" p join "user" u on u."id" = p."userId"`;

// Posts older than the current cycle are never served, even if the wipe has not run yet.
async function getFeed({ env, url }) {
	const cycle = await getCycle(env);
	const before = Number(url.searchParams.get('before')) || Date.now() + 1;
	const posts = await rows(
		env.DB.prepare(
			`${POST_SELECT} where p."createdAt" >= ? and p."createdAt" < ? order by p."createdAt" desc limit ${FEED_PAGE}`
		).bind(cycle.startedAt, before)
	);
	return { posts, cycle };
}

async function recordBody(env, user, body) {
	if (!SHARES.includes(body.share)) fail('bad share');
	const today = day(body.today);
	const habit = await ownHabit(env, user, body.habitId);
	const logs = await rows(
		env.DB.prepare(
			'select "day", "done" from "habit_log" where "habitId" = ? and "day" >= ? order by "day" desc'
		).bind(habit.id, addDays(today, -STREAK_LOOKBACK_DAYS))
	);
	const week = logs.filter((l) => l.day > addDays(today, -7) && l.day <= today);
	const result = recordText(habit, body.share, {
		streakDays: streak(logs, habit.kind, today),
		weekDone: week.filter((l) => l.done).length,
		weekTracked: week.length
	});
	return result || fail('nothing to share yet: track a few days first');
}

async function createPost({ env, user, body }) {
	const recent = await env.DB.prepare(
		'select count(*) as "n" from "post" where "userId" = ? and "createdAt" > ?'
	)
		.bind(user.id, Date.now() - 60_000)
		.first();
	if (recent.n >= POSTS_PER_MINUTE) fail('slow down a little', 429);

	const kind = body.habitId ? 'record' : 'text';
	const content =
		kind === 'record'
			? await recordBody(env, user, body)
			: text(body.body, MAX_BODY) || fail(`posts are 1-${MAX_BODY} characters`);
	const post = {
		id: crypto.randomUUID(),
		userId: user.id,
		kind,
		body: content,
		createdAt: Date.now()
	};
	await env.DB.prepare(
		'insert into "post" ("id", "userId", "kind", "body", "createdAt") values (?, ?, ?, ?, ?)'
	)
		.bind(post.id, user.id, kind, content, post.createdAt)
		.run();
	return { post: { ...post, name: user.name, comments: 0 } };
}

async function getPost({ env, params }) {
	const cycle = await getCycle(env);
	const post = await env.DB.prepare(`${POST_SELECT} where p."id" = ? and p."createdAt" >= ?`)
		.bind(params.id, cycle.startedAt)
		.first();
	if (!post) fail('post not found', 404);
	const comments = await rows(
		env.DB.prepare(
			`select c."id", c."userId", u."name", c."body", c."createdAt"
			from "comment" c join "user" u on u."id" = c."userId"
			where c."postId" = ? order by c."createdAt" limit ${MAX_COMMENTS}`
		).bind(post.id)
	);
	return { post, comments };
}

async function deletePost({ env, user, params }) {
	const post = await env.DB.prepare('select "id" from "post" where "id" = ? and "userId" = ?')
		.bind(params.id, user.id)
		.first();
	if (!post) fail('post not found', 404);
	await env.DB.batch([
		env.DB.prepare('delete from "comment" where "postId" = ?').bind(post.id),
		env.DB.prepare('delete from "post" where "id" = ?').bind(post.id)
	]);
	return { ok: true };
}

async function createComment({ env, user, params, body }) {
	const content = text(body.body, MAX_BODY) || fail(`comments are 1-${MAX_BODY} characters`);
	const post = await env.DB.prepare('select "id" from "post" where "id" = ?')
		.bind(params.id)
		.first();
	if (!post) fail('post not found', 404);
	const comment = {
		id: crypto.randomUUID(),
		userId: user.id,
		body: content,
		createdAt: Date.now()
	};
	await env.DB.prepare(
		'insert into "comment" ("id", "postId", "userId", "body", "createdAt") values (?, ?, ?, ?, ?)'
	)
		.bind(comment.id, post.id, user.id, content, comment.createdAt)
		.run();
	return { comment: { ...comment, name: user.name } };
}

async function deleteComment({ env, user, params }) {
	await env.DB.prepare('delete from "comment" where "id" = ? and "userId" = ?')
		.bind(params.id, user.id)
		.run();
	return { ok: true };
}

// ----- people ----------------------------------------------------------------------------------

// Another person's page: their public habits, plus their friends-only habits if you follow each other.
async function getPerson({ env, user, params, url }) {
	const today = day(url.searchParams.get('today'));
	const person = await env.DB.prepare('select "id", "name" from "user" where "id" = ?')
		.bind(params.id)
		.first();
	if (!person) fail('person not found', 404);

	const follows = await rows(
		env.DB.prepare(
			'select "followerId" from "follow" where ("followerId" = ?1 and "followeeId" = ?2) or ("followerId" = ?2 and "followeeId" = ?1)'
		).bind(user.id, person.id)
	);
	const following = follows.some((f) => f.followerId === user.id);
	const followsYou = follows.some((f) => f.followerId === person.id);
	const isSelf = person.id === user.id;
	const visible = isSelf
		? VISIBILITIES
		: following && followsYou
			? ['friends', 'public']
			: ['public'];

	const habits = (await listHabits(env, person.id)).filter((h) => visible.includes(h.visibility));
	const logsById = groupBy(habits.length ? await recentLogs(env, person.id, today) : [], 'habitId');
	const windowStart = addDays(today, -PROFILE_WINDOW_DAYS);

	return {
		person,
		isSelf,
		following,
		followsYou,
		windowDays: PROFILE_WINDOW_DAYS,
		habits: habits.map((h) => {
			const logs = logsById.get(h.id) || [];
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

async function follow({ env, user, params }) {
	if (params.id === user.id) fail('that is you');
	const person = await env.DB.prepare('select "id" from "user" where "id" = ?')
		.bind(params.id)
		.first();
	if (!person) fail('person not found', 404);
	await env.DB.prepare(
		'insert or ignore into "follow" ("followerId", "followeeId", "createdAt") values (?, ?, ?)'
	)
		.bind(user.id, person.id, Date.now())
		.run();
	return { following: true };
}

async function unfollow({ env, user, params }) {
	await env.DB.prepare('delete from "follow" where "followerId" = ? and "followeeId" = ?')
		.bind(user.id, params.id)
		.run();
	return { following: false };
}

// [method, path with :params, handler]
export const ROUTES = [
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
	['DELETE', '/api/people/:id/follow', unfollow]
];
