// Session state shared by every screen: who is signed in, what they track, and the current cycle.
import { api, setToken } from './api.js';
import { authClient } from './auth.js';

// `down` holds a message when the API cannot be used right now (daily limit reached, or offline).
export const app = $state({
  ready: false,
  down: '',
  user: null,
  region: '',
  bio: '',
  wipeHabits: 'keep',
  cycle: null,
  habits: []
});

const UNAUTHORIZED = 401;

export async function loadSession() {
  app.down = '';
  try {
    const me = await api('/api/me');
    Object.assign(app, me);
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

// What the 40-day wipe does to a person's own habits (their choice; see api/lib/cycle.js).
export const WIPE_HABITS_COPY = {
  keep: 'Keep my habits and every tracked day',
  records: 'Delete my tracked days, keep my list of habits',
  all: 'Delete my habits and every tracked day'
};

export const VISIBILITY_COPY = {
  private: 'Private: only you',
  friends: 'Friends: people you follow who follow you back',
  public: 'Public: anyone on 40'
};
