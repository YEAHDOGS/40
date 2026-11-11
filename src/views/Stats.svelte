<script>
  import { api } from '#lib/api.js';
  import { app } from '#lib/app.svelte.js';
  import { monthLabel, monthOf, shiftMonth, today } from '#lib/dates.js';

  const NOW = today();

  let month = $state(monthOf(NOW));
  let stats = $state(null);
  let error = $state('');
  let notice = $state('');

  async function load(which) {
    stats = null;
    error = '';
    try {
      const res = await api(`/api/stats?month=${which}&today=${NOW}`);
      if (which === month) stats = res;
    } catch (err) {
      error = err.message;
    }
  }

  $effect(() => {
    load(month);
  });

  async function share(habit, kind) {
    error = '';
    notice = '';
    try {
      const { post } = await api('/api/posts', {
        method: 'POST',
        json: { habitId: habit.id, share: kind, today: NOW }
      });
      notice = `Posted: "${post.body}"`;
    } catch (err) {
      error = err.message;
    }
  }

  const percent = (done, tracked) => (tracked ? Math.round((done / tracked) * 100) : 0);
</script>

<div class="mt-2 mb-3 flex items-center justify-between">
  <button
    class="btn-quiet px-3 py-1"
    onclick={() => (month = shiftMonth(month, -1))}
    aria-label="Previous month">‹</button
  >
  <h1 class="font-bold">{monthLabel(month)}</h1>
  <button
    class="btn-quiet px-3 py-1"
    onclick={() => (month = shiftMonth(month, 1))}
    disabled={month >= monthOf(NOW)}
    aria-label="Next month">›</button
  >
</div>

{#if error}<p class="mb-3 text-sm text-ember" role="alert">{error}</p>{/if}
{#if notice}<p class="mb-3 text-sm text-moss" role="status">{notice}</p>{/if}

{#if !app.habits.length}
  <p class="card text-mute">Nothing tracked yet. Add something on the Track tab.</p>
{:else if !stats}
  <p class="text-mute">Loading…</p>
{:else}
  <div class="flex flex-col gap-3">
    {#each stats.habits as habit (habit.id)}
      {@const quit = habit.kind === 'quit'}
      {@const monthPct = percent(habit.monthDone, habit.monthTracked)}
      <article class="card">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold">{habit.name}</h2>
          <span class="text-xs text-mute">{habit.visibility}</span>
        </div>

        <p class="mt-2 text-3xl font-black {habit.streak ? 'text-moss' : 'text-mute'}">
          {habit.streak}
          <span class="text-sm font-normal text-mute">
            day{habit.streak === 1 ? '' : 's'}
            {quit ? 'clean' : 'in a row'}
          </span>
        </p>

        <div class="mt-3">
          <div class="flex justify-between text-sm">
            <span>This month</span>
            <span class="text-mute">
              {habit.monthDone} of {habit.monthTracked} tracked days · {monthPct}%
            </span>
          </div>
          <div class="mt-1 h-2 overflow-hidden bg-raise">
            <div class="h-full {quit ? 'bg-ember' : 'bg-moss'}" style:width="{monthPct}%"></div>
          </div>
        </div>

        <div class="mt-2 flex justify-between text-sm">
          <span>{month.slice(0, 4)}</span>
          <span class="text-mute">
            {habit.yearDone} of {habit.yearTracked} tracked days ·
            {percent(habit.yearDone, habit.yearTracked)}%
          </span>
        </div>

        <div class="mt-3 border-t border-line pt-3 text-sm">
          {#if habit.everyone}
            <p>
              More often than <strong>{habit.everyone.moreThan}%</strong> of the
              {habit.everyone.people} other people sharing “{habit.name}” on 40.
            </p>
            {#if habit.local}
              <p class="mt-1">
                More often than <strong>{habit.local.moreThan}%</strong> of the
                {habit.local.people} in {stats.region}.
              </p>
            {/if}
          {:else}
            <p class="text-mute">
              Comparisons show up once {stats.minCohort} other people share this habit and you have tracked
              days this month.
            </p>
          {/if}
          {#if habit.visibility === 'private'}
            <p class="mt-1 text-xs text-mute">
              Private: your numbers are never part of anyone else’s comparison.
            </p>
          {/if}
        </div>

        <div class="mt-3 flex gap-2">
          <button class="btn-quiet flex-1 text-sm" onclick={() => share(habit, 'streak')}>
            Post streak
          </button>
          <button class="btn-quiet flex-1 text-sm" onclick={() => share(habit, 'week')}>
            Post this week
          </button>
        </div>
      </article>
    {/each}
  </div>
{/if}
