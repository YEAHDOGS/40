// Session state shared by every screen: who is signed in, what they track, and the current cycle.
import { api, setToken } from './api.js';
import { authClient } from './auth.js';

// `down` holds a message when the API cannot be used right now (daily limit reached, or offline).
export const app = $state({
	ready: false,
	down: '',
	user: null,
	region: '',
	cycle: null,
	habits: []
});

const UNAUTHORIZED = 401;

export async function loadSession() {
	app.down = '';
	try {
		const me = await api('/api/me');
		Object.assign(app, { user: me.user, region: me.region, cycle: me.cycle, habits: me.habits });
	} catch (err) {
		app.user = null;
		if (err.status !== UNAUTHORIZED) app.down = err.message || 'Cannot reach 40 right now.';
	}
	app.ready = true;
}

export async function signOut() {
	await authClient.signOut().catch(() => {});
	setToken(null);
	Object.assign(app, { user: null, habits: [] });
}

// Words for a habit's two states, by kind.
export const KIND_COPY = {
	quit: { label: 'Quit', hint: 'a vice: less is better', done: 'Did it', good: 'clean' },
	build: { label: 'Build', hint: 'a good habit: more is better', done: 'Done', good: 'done' }
};

export const VISIBILITY_COPY = {
	private: 'Private: only you',
	friends: 'Friends: people you follow who follow you back',
	public: 'Public: anyone on 40'
};
