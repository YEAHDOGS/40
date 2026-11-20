// Session state shared by every screen: who is signed in, what they track, and the current cycle.
import { api, isDemo, request, setDemo, setGate, setToken } from './api.js';
import { authClient } from './auth.js';

// `down` holds a message when the API cannot be used right now (daily limit reached, or offline).
// `locked`: the site password has not been entered here (api/lib/gate.js). `demo`: showing sample data.
export const app = $state({
  ready: false,
  down: '',
  locked: false,
  demo: false,
  user: null,
  region: '',
  bio: '',
  wipeHabits: 'keep',
  cycle: null,
  habits: []
});

const UNAUTHORIZED = 401;
const LOCKED = 'locked';
const GATE_PATH = '/api/gate';

export async function loadSession() {
  app.down = '';
  try {
    // The demo is behind the site password too, so it starts by asking the server about the pass.
    if (isDemo() && !(await request(GATE_PATH)).open) setDemo(false);
    const me = await api('/api/me');
    Object.assign(app, me, { locked: false, demo: isDemo() });
  } catch (err) {
    Object.assign(app, { user: null, habits: [], demo: false, locked: err.code === LOCKED });
    if (app.locked) setGate(null);
    else if (err.status !== UNAUTHORIZED) app.down = err.message || 'Cannot reach 40 right now.';
  }
  app.ready = true;
}

/** Trades the site password for the pass, then loads whatever is behind it. Throws Error(message). */
export async function unlock(password) {
  setGate((await request(GATE_PATH, { method: 'POST', json: { password } })).pass);
  await loadSession();
}

/** Opens the app on sample data: nothing is sent or saved, and a reload starts it over. */
export async function startDemo() {
  setDemo(true);
  await loadSession();
}

// Leaving the demo goes back to the sign-in screen; the account signed in on this device stays signed in.
export async function signOut() {
  if (isDemo()) setDemo(false);
  else {
    await authClient.signOut().catch(() => {});
    setToken(null);
  }
  await loadSession();
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
