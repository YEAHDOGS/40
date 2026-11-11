// Cloudflare Worker: /api/* backend. Everything else is the static app in dist/web/. Created by DOGS.
import { HttpError, ROUTES } from './api.js';
import { allowedOrigins, createAuth, enabledProviders } from './auth.js';
import { wipeIfDue } from './cycle.js';
import { check, meter, settle } from './limits.js';
import { DEMO_EMAIL, isPreview, signUpBlocked } from './preview.js';
import pkg from '../package.json' with { type: 'json' };

const MAX_BODY_BYTES = 16_384;

const json = (data, status = 200) => Response.json(data, { status });

function withCors(req, res, env) {
	const origin = req.headers.get('Origin');
	if (origin && allowedOrigins(env, req).includes(origin)) {
		res = new Response(res.body, res);
		res.headers.set('Access-Control-Allow-Origin', origin);
		res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		// Better Auth's bearer plugin returns the session token in this header.
		res.headers.set('Access-Control-Expose-Headers', 'set-auth-token');
		res.headers.set('Vary', 'Origin');
	}
	return res;
}

// '/api/habits/:id' matches '/api/habits/abc' and returns { id: 'abc' }; null when it does not match.
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

async function readBody(req) {
	if (req.method === 'GET' || req.method === 'DELETE') return {};
	const raw = await req.text();
	if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'request too large');
	try {
		const body = raw ? JSON.parse(raw) : {};
		return body && typeof body === 'object' ? body : {};
	} catch {
		throw new HttpError(400, 'bad json');
	}
}

async function route(req, env) {
	const url = new URL(req.url);
	const { pathname } = url;

	if (signUpBlocked(env, pathname)) return json({ error: 'sign-up is closed here' }, 403);

	// Better Auth: sign-up, sign-in, sign-out, get-session, ...
	if (pathname.startsWith('/api/auth/')) return (await createAuth(env, req)).handler(req);

	// Everything below needs a signed-in user.
	const auth = await createAuth(env, req);
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session) return json({ error: 'unauthorized' }, 401);

	for (const [method, pattern, handler] of ROUTES) {
		const params = method === req.method ? matchPath(pattern, pathname) : null;
		if (!params) continue;
		const body = await readBody(req);
		return json(await handler({ env, user: session.user, params, url, body }));
	}
	return json({ error: 'not found' }, 404);
}

export default {
	async fetch(req, env, ctx) {
		const { pathname } = new URL(req.url);
		if (req.method === 'OPTIONS') return withCors(req, new Response(null, { status: 204 }), env);
		// No database, no cost. Tells the sign-in screen what it can offer: the demo account on a Preview
		// (where it is the only way in), otherwise whichever providers have their secrets set.
		if (pathname === '/api/health') {
			const demoEmail = isPreview(env) ? DEMO_EMAIL : null;
			const providers = demoEmail ? [] : enabledProviders(env);
			return withCors(req, json({ ok: true, version: pkg.version, demoEmail, providers }), env);
		}
		try {
			const refused = await check(req, env);
			if (refused) return withCors(req, refused, env);
			return withCors(req, await route(req, { ...env, DB: meter(env.DB, env) }), env);
		} catch (err) {
			if (err instanceof HttpError)
				return withCors(req, json({ error: err.message }, err.status), env);
			console.error(err);
			return withCors(req, json({ error: 'internal error' }, 500), env);
		} finally {
			settle(env, ctx);
		}
	},

	// Cron trigger (see wrangler.jsonc): deletes every post and comment when the 40-day cycle ends.
	async scheduled(event, env, ctx) {
		ctx.waitUntil(wipeIfDue(env, event.scheduledTime));
	}
};
