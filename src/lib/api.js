import { isTauri } from '@tauri-apps/api/core';

const TOKEN_KEY = 'forty.auth.token';
// The pass the site password unlocks (api/lib/gate.js). Every request carries it.
const GATE_KEY = 'forty.gate';
export const GATE_HEADER = 'X-Forty-Gate';
// Demo mode lasts for the tab: sample data in memory (./demo.js), nothing sent or saved.
const DEMO_KEY = 'forty.demo';
const DEMO_ON = 'on';
// Where the packaged desktop and mobile apps find the API.
const PRODUCTION_API = 'https://40.dogs.red';

// Web: the same Worker serves the app and /api, so relative URLs work.
// Dev (web, desktop and mobile): Vite proxies /api to `npm run dev`.
// Packaged Tauri apps: the webview origin is tauri.localhost, so we need the real API URL.
export const API_URL = isTauri() && !import.meta.env.DEV ? PRODUCTION_API : '';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export const getGate = () => localStorage.getItem(GATE_KEY) || '';
export const setGate = (pass) =>
  pass ? localStorage.setItem(GATE_KEY, pass) : localStorage.removeItem(GATE_KEY);

export const isDemo = () => sessionStorage.getItem(DEMO_KEY) === DEMO_ON;
export const setDemo = (on) =>
  on ? sessionStorage.setItem(DEMO_KEY, DEMO_ON) : sessionStorage.removeItem(DEMO_KEY);

/** The real API, even in demo mode. Same contract as api(). */
export async function request(path, { json, ...init } = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (getGate()) headers.set(GATE_HEADER, getGate());
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(json);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || res.statusText);
    error.status = res.status;
    error.code = body.code;
    throw error;
  }
  return res.json();
}

// api('/api/habits', { method: 'POST', json: { name } }) -> parsed JSON, or throws Error(message).
// In demo mode the answer comes from the sample data instead, loaded only then.
export async function api(path, init = {}) {
  if (!isDemo()) return request(path, init);
  return (await import('./demo.js')).demoApi(path, init);
}
