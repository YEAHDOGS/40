// Previews (staging): dummy data only, one shared demo account. Created by DOGS.
//
// Preview mode is switched on by the PREVIEW_PASSWORD secret, which exists ONLY in the Previews base
// config (`pnpm wrangler preview base-config secret put PREVIEW_PASSWORD`), never on production.
// The demo account's password IS that secret, so typing it on the sign-in screen is the whole login.
// Nobody can create other accounts on a Preview: the demo account and all of its data come from
// scripts/seed-preview.js.

export const DEMO_EMAIL = 'demo@forty.test';
const SIGN_UP_PATH = '/api/auth/sign-up';

export const isPreview = (env) => Boolean(env.PREVIEW_PASSWORD);

export const signUpBlocked = (env, pathname) => isPreview(env) && pathname.startsWith(SIGN_UP_PATH);
