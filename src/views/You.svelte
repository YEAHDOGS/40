<script>
  import { href } from '#lib/router.svelte.js';
  import { THEMES, applyTheme, savedTheme } from '#lib/theme.js';
  import { api } from '#lib/api.js';
  import { VISIBILITY_COPY, WIPE_HABITS_COPY, app, signOut } from '#lib/app.svelte.js';
  import { countdown } from '#lib/dates.js';
  import HabitForm from '../components/HabitForm.svelte';
  import REGIONS from '#lib/regions.json';

  const MAX_NAME = 30;
  const MAX_BIO = 160;

  let error = $state('');
  let theme = $state(savedTheme());
  let name = $state(app.user.name);
  let bio = $state(app.bio);
  const changed = $derived(name.trim() !== app.user.name || bio.trim() !== app.bio);

  async function setName(event) {
    event.preventDefault();
    error = '';
    try {
      const saved = await api('/api/me', { method: 'PUT', json: { name, bio } });
      app.user.name = saved.name;
      app.bio = saved.bio;
    } catch (err) {
      error = err.message;
    }
  }

  async function setRegion(event) {
    error = '';
    try {
      const res = await api('/api/me', { method: 'PUT', json: { region: event.target.value } });
      app.region = res.region;
    } catch (err) {
      error = err.message;
    }
  }

  async function setWipeHabits(event) {
    error = '';
    try {
      const saved = await api('/api/me', {
        method: 'PUT',
        json: { wipeHabits: event.target.value }
      });
      app.wipeHabits = saved.wipeHabits;
    } catch (err) {
      error = err.message;
    }
  }

  async function setVisibility(habit, visibility) {
    error = '';
    try {
      await api(`/api/habits/${habit.id}`, { method: 'PUT', json: { visibility } });
      habit.visibility = visibility;
    } catch (err) {
      error = err.message;
    }
  }

  async function remove(habit) {
    if (!confirm(`Delete "${habit.name}" and its whole history? This cannot be undone.`)) return;
    error = '';
    try {
      await api(`/api/habits/${habit.id}`, { method: 'DELETE' });
      app.habits = app.habits.filter((h) => h.id !== habit.id);
    } catch (err) {
      error = err.message;
    }
  }
</script>

<section class="card mt-2">
  <form class="flex flex-col gap-2" onsubmit={setName}>
    <input
      class="field font-bold"
      bind:value={name}
      maxlength={MAX_NAME}
      aria-label="The name people see"
      required
    />
    <textarea
      class="field resize-none"
      rows="2"
      bind:value={bio}
      maxlength={MAX_BIO}
      placeholder="A line about you (optional, public)"
      aria-label="Bio"></textarea>
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-mute">Your name and bio are public and are never wiped.</p>
      <button class="btn-quiet" disabled={!changed || !name.trim()}>Save</button>
    </div>
  </form>
  <p class="mt-3 text-sm text-mute">{app.user.email} (never shown to anyone)</p>
  <a class="mt-2 inline-block text-sm underline" href={href('person', app.user.id)}>
    View your page
  </a>

  <label class="mt-4 block text-sm text-mute">
    State, for local comparisons (optional)
    <select class="field mt-1" value={app.region} onchange={setRegion}>
      <option value="">Not set</option>
      {#each REGIONS as code (code)}
        <option value="US-{code}">{code}</option>
      {/each}
    </select>
  </label>
</section>

{#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

<section class="card mt-3">
  <h2 class="font-bold">The 40-day wipe</h2>
  <p class="mt-1 text-sm text-mute">
    In {app.cycle ? countdown(app.cycle.endsAt) : '40 days'} every post and comment on 40 is deleted,
    for everyone. Your account, profile and follows stay. What happens to your own records is up to you:
  </p>
  <select
    class="field mt-3"
    value={app.wipeHabits}
    onchange={setWipeHabits}
    aria-label="What the wipe does to your habits"
  >
    {#each Object.entries(WIPE_HABITS_COPY) as [value, label] (value)}
      <option {value}>{label}</option>
    {/each}
  </select>
</section>

<section class="card mt-3">
  <h2 class="font-bold">What you track</h2>
  <p class="mb-3 text-sm text-mute">You decide who sees each one. Change it any time.</p>
  <div class="flex flex-col gap-3">
    {#each app.habits as habit (habit.id)}
      <div class=" border border-line p-3">
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">{habit.name}</span>
          <span class="text-xs {habit.kind === 'quit' ? 'text-ember' : 'text-moss'}"
            >{habit.kind}</span
          >
        </div>
        <div class="mt-2 flex gap-2">
          <select
            class="field py-1.5 text-sm"
            value={habit.visibility}
            aria-label="Who can see {habit.name}"
            onchange={(event) => setVisibility(habit, event.target.value)}
          >
            {#each Object.entries(VISIBILITY_COPY) as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
          <button class="btn-quiet py-1.5 text-sm" onclick={() => remove(habit)}>Delete</button>
        </div>
      </div>
    {:else}
      <p class="text-sm text-mute">Nothing yet.</p>
    {/each}
  </div>
</section>

<section class="card mt-3">
  <h2 class="mb-3 font-bold">Track something new</h2>
  <HabitForm />
</section>

<section class="card mt-3">
  <h2 class="font-bold">Theme</h2>
  <div class="mt-3 grid grid-cols-2 gap-2">
    {#each THEMES as option (option.id)}
      <button
        class="btn-quiet px-2 text-xs {theme === option.id ? 'border-moss text-moss' : ''}"
        aria-pressed={theme === option.id}
        onclick={() => (theme = applyTheme(option.id))}
      >
        {option.name}
      </button>
    {/each}
  </div>
</section>

<button class="btn-quiet mt-3 w-full" onclick={signOut}>Sign out</button>
