// tests/audit.test.js — authz denial audit logging.
//
// Regression guard for the invariant: every UNAUTHORIZED / FORBIDDEN denial
// on the GraphQL and REST surfaces leaves a single structured audit line
// (see src/server/audit.js). Before this existed, authz denials failed
// silently — an attacker probing gated endpoints was invisible to operators.

import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // prisma-backed suites need a throwaway sqlite DB

import { auditAuthzDenied } from '../src/server/audit.js';
import { restApiHandler } from '../src/server/rest.js';

const { resolvers } = await import('../src/server/resolvers.js');

// Capture every console.error while `fn` runs, then return the parsed audit
// lines (JSON lines with audit:true) plus a restore. Audit events go to
// stderr so stdout stays clean for structured consumers.
const captureAuditLines = async (fn) => {
	const seen = [];
	const orig = console.error;
	console.error = (...args) => {
		for (const a of args) {
			if (typeof a === 'string' && a.startsWith('{')) {
				try {
					const parsed = JSON.parse(a);
					if (parsed && parsed.audit === true) seen.push(parsed);
				} catch { /* non-JSON log line, ignore */ }
			}
		}
		orig(...args);
	};
	try {
		await fn();
	} finally {
		console.error = orig;
	}
	return seen;
};

test('audit: structured authz-denial events', async (t) => {
	await t.test('emits a parseable single-line event with all fields', async () => {
		const lines = await captureAuditLines(() =>
			auditAuthzDenied({
				surface: 'graphql',
				operation: 'likePost',
				code: 'UNAUTHORIZED',
				userId: null,
				clientIp: 'unknown'
			})
		);
		assert.strictEqual(lines.length, 1, 'exactly one audit line per denial');
		const e = lines[0];
		assert.strictEqual(e.event, 'authz.denied');
		assert.strictEqual(e.surface, 'graphql');
		assert.strictEqual(e.operation, 'likePost');
		assert.strictEqual(e.code, 'UNAUTHORIZED');
		assert.strictEqual(e.userId, null);
		assert.strictEqual(e.clientIp, 'unknown');
		assert.ok(!Number.isNaN(Date.parse(e.ts)), 'ts is a valid ISO timestamp');
	});

	await t.test('never logs a token — privacy invariant', async () => {
		const token = `SECRET-TOKEN-${Math.random().toString(36).slice(2)}`;
		const lines = await captureAuditLines(() =>
			auditAuthzDenied({
				surface: 'rest',
				operation: 'GET /posts',
				code: 'UNAUTHORIZED',
				userId: 'u-123',
				clientIp: '10.0.0.1'
			})
		);
		assert.strictEqual(lines.length, 1);
		assert.ok(!JSON.stringify(lines[0]).includes(token), 'audit line must not echo a token');
		assert.ok(!('token' in lines[0]), 'audit line must have no token field at all');
	});

	await t.test('a failing audit emit can never break request handling', async () => {
		// JSON.stringify of a circular object throws inside the logger —
		// the wrapper must swallow it so the denial still goes through.
		const circular = { op: 'likePost' };
		circular.self = circular;
		const lines = await captureAuditLines(() =>
			auditAuthzDenied({ surface: 'graphql', operation: circular, code: 'UNAUTHORIZED' })
		);
		assert.strictEqual(lines.length, 0, 'no audit line, but no throw either');
	});
});

test('audit: GraphQL requireAuth denials are logged', async (t) => {
	await t.test('anonymous mutation call logs UNAUTHORIZED with the resolver name', async () => {
		const lines = await captureAuditLines(async () => {
			await assert.rejects(
				resolvers.Mutation.likePost(null, { postId: 'x' }, {}),
				/Unauthorized/,
				'still denied before touching the DB'
			);
		});
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].event, 'authz.denied');
		assert.strictEqual(lines[0].surface, 'graphql');
		assert.strictEqual(lines[0].operation, 'likePost');
		assert.strictEqual(lines[0].code, 'UNAUTHORIZED');
		assert.strictEqual(lines[0].userId, null);
	});

	await t.test('anonymous gated query logs UNAUTHORIZED with the query name', async () => {
		const lines = await captureAuditLines(async () => {
			await assert.rejects(
				resolvers.Query.trends(null, {}, {}),
				/Unauthorized/
			);
		});
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].operation, 'trends');
		assert.strictEqual(lines[0].code, 'UNAUTHORIZED');
	});

	await t.test('clientIp from context flows into the audit line', async () => {
		const lines = await captureAuditLines(async () => {
			await assert.rejects(
				resolvers.Mutation.likePost(null, { postId: 'x' }, { clientIp: '203.0.113.9' }),
				/Unauthorized/
			);
		});
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].clientIp, '203.0.113.9');
	});
});

test('audit: GraphQL requireAdmin denials are logged', async (t) => {
	await t.test('non-admin triggerWipe logs FORBIDDEN with the caller userId', async () => {
		// No FORTY_ADMIN_* env in this process -> deny-by-default.
		const lines = await captureAuditLines(async () => {
			await assert.rejects(
				resolvers.Mutation.triggerWipe(null, {}, { userId: 'probe-user-123' }),
				/Forbidden/,
				'still denied'
			);
		});
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].surface, 'graphql');
		assert.strictEqual(lines[0].operation, 'triggerWipe');
		assert.strictEqual(lines[0].code, 'FORBIDDEN');
		assert.strictEqual(lines[0].userId, 'probe-user-123');
	});
});

const mockRes = () => {
	const res = {
		status: null,
		body: null,
		headers: null,
		writeHead(status, headers) { this.status = status; this.headers = headers; },
		end(body) { this.body = body; }
	};
	return res;
};

const mockReq = ({ method = 'GET', url = '/', headers = {} } = {}) => ({
	method,
	url,
	headers,
	socket: { remoteAddress: '192.0.2.77' }
});

test('audit: REST 401/403 denials are logged', async (t) => {
	await t.test('anonymous GET /posts logs UNAUTHORIZED with route template + socket IP', async () => {
		const res = mockRes();
		const lines = await captureAuditLines(async () => {
			await restApiHandler(mockReq({ url: '/api/posts' }), res);
		});
		assert.strictEqual(res.status, 401, 'still a clean 401');
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].surface, 'rest');
		assert.strictEqual(lines[0].operation, 'GET /posts');
		assert.strictEqual(lines[0].code, 'UNAUTHORIZED');
		assert.strictEqual(lines[0].userId, null);
		assert.strictEqual(lines[0].clientIp, '192.0.2.77');
	});

	await t.test('anonymous PUT /users/profile logs UNAUTHORIZED', async () => {
		const res = mockRes();
		const lines = await captureAuditLines(async () => {
			await restApiHandler(mockReq({ method: 'PUT', url: '/api/users/profile' }), res);
		});
		assert.strictEqual(res.status, 401);
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].operation, 'PUT /users/profile');
		assert.strictEqual(lines[0].code, 'UNAUTHORIZED');
	});
});
