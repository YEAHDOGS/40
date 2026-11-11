import { isTauri } from '@tauri-apps/api/core';

const TOKEN_KEY = 'forty.auth.token';
// Where the packaged desktop and mobile apps find the API.
const PRODUCTION_API = 'https://40.dogs.red';

// Web: the same Worker serves the app and /api, so relative URLs work.
// Dev (web, desktop and mobile): Vite proxies /api to `npm run dev`.
// Packaged Tauri apps: the webview origin is tauri.localhost, so we need the real API URL.
export const API_URL = isTauri() && !import.meta.env.DEV ? PRODUCTION_API : '';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

// api('/api/habits', { method: 'POST', json: { name } }) -> parsed JSON, or throws Error(message).
export async function api(path, { json, ...init } = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(json);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const error = new Error((await res.json().catch(() => ({}))).error || res.statusText);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
