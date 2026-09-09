// tests/client-ip.test.js — regression tests for proxy-header trust.
//
// The rate-limit identity must not be attacker-controlled: X-Forwarded-For
// / X-Real-IP are honored only when TRUST_PROXY=1. Trusting them by default
// would let a client mint a fresh IP per request and walk around the per-IP
// login/signup budgets in rate-limit.js.

import './db-test-env.js';
import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'node:stream';

const { resolveClientIp } = await import('../src/server/client-ip.js');
const { restApiHandler } = await import('../src/server/rest.js');
const { resetAuthGuards } = await import('../src/server/rate-limit.js');

// --- unit: default (untrusted) -------------------------------------------
test('client-ip: forged X-Forwarded-For is ignored by default', () => {
	delete process.env.TRUST_PROXY;
	assert.strictEqual(
		resolveClientIp({ 'x-forwarded-for': '203.0.113.7' }),
		'unknown'
	);
});

test('client-ip: socket address wins over forged headers when untrusted', () => {
	delete process.env.TRUST_PROXY;
	assert.strictEqual(
		resolveClientIp(
			{ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.8' },
			{ socketAddress: '198.51.100.9' }
		),
		'198.51.100.9'
	);
});

test('client-ip: blank socket address falls back to unknown', () => {
	delete process.env.TRUST_PROXY;
	assert.strictEqual(resolveClientIp({}, { socketAddress: '  ' }), 'unknown');
});

// --- unit: trusted proxy mode --------------------------------------------
test('client-ip: TRUST_PROXY=1 honors X-Forwarded-For, first hop wins', () => {
	process.env.TRUST_PROXY = '1';
	try {
		assert.strictEqual(
			resolveClientIp(
				{ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.4' },
				{ socketAddress: '198.51.100.9' }
			),
			'203.0.113.7'
		);
	} finally {
		delete process.env.TRUST_PROXY;
	}
});

test('client-ip: TRUST_PROXY=true honors X-Real-IP as fallback', () => {
	process.env.TRUST_PROXY = 'true';
	try {
		assert.strictEqual(
			resolveClientIp({ 'x-real-ip': '203.0.113.8' }),
			'203.0.113.8'
		);
	} finally {
		delete process.env.TRUST_PROXY;
	}
});

test('client-ip: works with WHATWG Headers instances (yoga path)', () => {
	process.env.TRUST_PROXY = '1';
	try {
		const h = new Headers({ 'x-forwarded-for': '203.0.113.7' });
		assert.strictEqual(resolveClientIp(h), '203.0.113.7');
	} finally {
		delete process.env.TRUST_PROXY;
	}
});

test('client-ip: non-string header values do not crash', () => {
	delete process.env.TRUST_PROXY;
	process.env.TRUST_PROXY = '1';
	try {
		assert.strictEqual(resolveClientIp({ 'x-forwarded-for': 12345 }), 'unknown');
		assert.strictEqual(resolveClientIp(null), 'unknown');
	} finally {
		delete process.env.TRUST_PROXY;
	}
});

// --- behavioral: the spoof actually defeats the IP budget when trusted,
// and buys nothing when untrusted -----------------------------------------
function mockReq(method, url, headers = {}, body = null) {
	const req = new Readable({ read() {} });
	req.method = method;
	req.url = url;
	req.headers = headers;
	if (body !== null) req.push(JSON.stringify(body));
	req.push(null);
	return req;
}
function mockRes() {
	let resolveFn;
	const done = new Promise((resolve) => { resolveFn = resolve; });
	const res = {
		statusCode: 200,
		headers: {},
		body: '',
		writeHead(status, headers) {
			this.statusCode = status;
			Object.assign(this.headers, headers);
			return this;
		},
		end(chunk) {
			if (chunk) this.body += chunk;
			resolveFn();
		}
	};
	return { res, done };
}
const callRest = async (method, url, headers, body) => {
	const { res, done } = mockRes();
	await restApiHandler(mockReq(method, url, headers, body), res, () => {});
	await done;
	let json = null;
	try { json = JSON.parse(res.body); } catch { /* non-JSON body */ }
	return { status: res.statusCode, json };
};

test('client-ip (REST): rotating spoofed XFF buys no fresh IP budget when untrusted', async () => {
	delete process.env.TRUST_PROXY;
	resetAuthGuards();
	let last;
	for (let i = 0; i < 21; i++) {
		// A fresh forged identity on every request...
		last = await callRest(
			'POST',
			'/api/auth/login',
			{ 'x-forwarded-for': `203.0.113.${i}` },
			{}
		);
	}
	// ...but they all land in the same 'unknown' bucket, so the 20/min
	// per-IP login budget still trips.
	assert.strictEqual(last.status, 429);
});

test('client-ip (REST): with TRUST_PROXY=1 distinct XFF identities get distinct budgets', async () => {
	process.env.TRUST_PROXY = '1';
	try {
		resetAuthGuards();
		let allFresh = true;
		for (let i = 0; i < 21; i++) {
			const r = await callRest(
				'POST',
				'/api/auth/login',
				{ 'x-forwarded-for': `198.51.100.${i}` },
				{}
			);
			if (r.status === 429) allFresh = false;
		}
		// Each spoofed IP is a fresh bucket → none exhaust the budget. This
		// is exactly why the headers must stay untrusted by default.
		assert.ok(allFresh, 'every distinct trusted-proxy IP got its own budget');
	} finally {
		delete process.env.TRUST_PROXY;
	}
});
