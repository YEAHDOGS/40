// Client IP resolution, shared by the REST and GraphQL auth surfaces.
//
// SECURITY: X-Forwarded-For / X-Real-IP are client-forgeable. Honoring them
// unconditionally lets an attacker mint a fresh IP identity per request and
// walk around the per-IP login/signup rate-limit budgets (the brute-force
// guards in rate-limit.js become decoration). Proxy headers are therefore
// only trusted when TRUST_PROXY=1 — i.e. the server sits behind a proxy we
// control that sanitizes them. Otherwise the direct transport address is
// used, falling back to 'unknown' when the transport gives us nothing.
//
// `headers` may be a node-style plain object or a WHATWG Headers instance.
export function resolveClientIp(headers, { socketAddress } = {}) {
	const trustProxy =
		process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
	if (trustProxy) {
		const fwd = readHeader(headers, 'x-forwarded-for');
		// First entry is the client as seen by the closest trusted proxy.
		if (fwd) return fwd.split(',')[0].trim();
		const real = readHeader(headers, 'x-real-ip');
		if (real) return real;
	}
	return socketAddress && socketAddress.trim() ? socketAddress.trim() : 'unknown';
}

function readHeader(headers, name) {
	if (!headers) return '';
	const value =
		typeof headers.get === 'function' ? headers.get(name) : headers[name];
	return typeof value === 'string' ? value.trim() : '';
}
