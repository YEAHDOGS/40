import { createAuthClient } from 'better-auth/svelte';
import { API_URL, GATE_HEADER, getGate, getToken, setToken } from './api.js';

// Better Auth client using bearer tokens (works the same on web, desktop and mobile).
export const authClient = createAuthClient({
  baseURL: `${API_URL || location.origin}/api/auth`,
  fetchOptions: {
    auth: { type: 'Bearer', token: () => getToken() || '' },
    // The site lock's pass (api/lib/gate.js) goes with every request.
    onRequest: (context) => {
      context.headers.set(GATE_HEADER, getGate());
    },
    onSuccess: ({ response }) => {
      const token = response.headers.get('set-auth-token');
      if (token) setToken(token);
    }
  }
});
