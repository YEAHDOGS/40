// Public build-time settings, read from .env (locally) or repo variables (CI).
// Import them from '$app/env/public'. Static = baked into the bundle, which Tauri apps need.
import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value) => value || '';

export const variables = defineEnvVars({
	PUBLIC_API_URL: {
		public: true,
		static: true,
		schema: optional,
		description: 'Production API URL used by packaged desktop/mobile apps'
	}
});
