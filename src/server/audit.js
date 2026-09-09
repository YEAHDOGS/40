// src/server/audit.js — structured audit logging for authorization denials.
//
// Gap this closes: authz denials (UNAUTHORIZED / FORBIDDEN on the GraphQL and
// REST surfaces) used to fail silently — the caller got the error, but the
// operator had no record of who was denied, on what operation, from where.
// Attackers probing gated endpoints (token guessing, admin-endpoint poking,
// cross-user post edits) now leave a parseable trail.
//
// Format: one JSON object per line, marked with `audit: true` so log
// collectors can filter it. Fields:
//   ts        ISO timestamp of the denial
//   event     always "authz.denied"
//   surface   "graphql" | "rest"
//   operation resolver name (GraphQL) or "METHOD /path" (REST)
//   code      "UNAUTHORIZED" | "FORBIDDEN"
//   userId    caller identity when a token was present, else null
//   clientIp  resolved client IP (client-ip.js semantics), else null
//
// Privacy invariant: tokens are NEVER logged. The userId is an opaque row id,
// not a username or email, so the audit trail can't be mined for PII.
// Logging itself never throws — an audit failure must not turn a clean
// denial into a 500.
// Transport: console.error (stderr), not stdout — stdout may be piped to
// structured consumers, and emitting here keeps the resolver's data channel
// clean (guarded by tests/graphql-wipe-admin.test.js's exact-stdout check).
export const auditAuthzDenied = ({ surface, operation, code, userId = null, clientIp = null }) => {
	try {
		const event = {
			audit: true,
			ts: new Date().toISOString(),
			event: 'authz.denied',
			surface,
			operation,
			code,
			userId: userId ?? null,
			clientIp: clientIp ?? null
		};
		console.error(JSON.stringify(event));
	} catch {
		// Audit is best-effort: never let it break request handling.
	}
};
