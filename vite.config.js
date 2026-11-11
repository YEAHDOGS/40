import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// Oldest browsers that get the full app: the first releases with CSS cascade layers, which Tailwind v4 requires.
// Anything older (down to the Chrome 40 Potato Target) gets the static fallback page in index.html instead.
// CSS is lowered by Lightning CSS (oklch -> rgb, color-mix fallbacks, etc.), which costs nothing at runtime.
const APP_CSS_TARGET = ['chrome99', 'edge99', 'firefox97', 'safari15.4', 'ios15.4']
// JS is lowered by Oxc. Safari stays at 16.4: anything lower makes Oxc rewrite every private class field in
// Svelte's runtime into WeakMap helpers for ALL browsers. Safari 15.4-16.3 can still run it natively, and the
// index.html error net swaps in the fallback page if one of them can't.
const APP_JS_TARGET = ['chrome99', 'edge99', 'firefox97', 'safari16.4', 'ios16.4']
// The optional Tauri shell lives in src/tauri; its Rust build output must not trigger dev reloads.
const NATIVE_SHELL_GLOB = '**/src/tauri/**'
// npm run devVite proxies the API to local wrangler (npm run dev).
const LOCAL_API = 'http://localhost:8788'
// Set by `tauri android dev` / `tauri ios dev` so a phone can reach this dev server.
const TAURI_DEV_HOST = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte()
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: TAURI_DEV_HOST || false,
    watch: { ignored: [NATIVE_SHELL_GLOB] },
    proxy: { '/api': { target: LOCAL_API } },
  },
  build: {
    target: APP_JS_TARGET,
    cssTarget: APP_CSS_TARGET,
  },
  test: {
    environment: 'node',
    include: ['api/**/*.spec.js', 'src/**/*.spec.js'],
    exclude: ['src/tauri/**', 'node_modules/**'],
  },
})
