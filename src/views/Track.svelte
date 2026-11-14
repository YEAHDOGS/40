<script>
  import { api } from '#lib/api.js';
  import { KIND_COPY, app } from '#lib/app.svelte.js';
  import HabitForm from '../components/HabitForm.svelte';
  import OnThisDay from '../components/OnThisDay.svelte';
  import { dayLabel, monthCells, monthLabel, monthOf, shiftMonth, today } from '#lib/dates.js';

  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const NOW = today();

  let month = $state(monthOf(NOW));
  let selected = $state(NOW);
  // day -> { habitId: 0 | 1 }. A day with an entry has been tracked.
  let logs = $state({});
  let error = $state('');
  let saving = $state(false);

  const record = $derived(logs[selected]);
  const doneIds = $derived(app.habits.filter((h) => record?.[h.id]).map((h) => h.id));

  async function loadMonth(which) {
    try {
      const res = await api(`/api/logs?from=${which}-01&to=${which}-31`);
      const next = {};
      for (const log of res.logs) (next[log.day] ??= {})[log.habitId] = log.done;
      if (which === month) logs = next;
    } catch (err) {
      error = err.message;
    }
  }

  $effect(() => {
    loadMonth(month);
  });

  function go(step) {
    month = shiftMonth(month, step);
    selected = month === monthOf(NOW) ? NOW : `${month}-01`;
  }

  async function save(done) {
    error = '';
    saving = true;
    try {
      const res = await api(`/api/days/${selected}`, { method: 'PUT', json: { done } });
      logs[res.day] = Object.fromEntries(res.logs.map((l) => [l.habitId, l.done]));
    } catch (err) {
      error = err.message;
    }
    saving = false;
  }

  const toggle = (id) =>
    save(doneIds.includes(id) ? doneIds.filter((other) => other !== id) : [...doneIds, id]);

  async function clearDay() {
    error = '';
    try {
      await api(`/api/days/${selected}`, { method: 'DELETE' });
      delete logs[selected];
    } catch (err) {
      error = err.message;
    }
  }
</script>

<OnThisDay />

{#if !app.habits.length}
  <section class="card mt-4">
    <h1 class="text-xl font-bold">What do you want to track?</h1>
    <p class="mt-1 mb-4 text-sm text-mute">
      Anything: something to quit, or something to keep doing. You can add more later.
    </p>
    <HabitForm />
  </section>
{:else}
  <section class="card mt-2">
    <div class="mb-3 flex items-center justify-between">
      <button class="btn-quiet px-3 py-1" onclick={() => go(-1)} aria-label="Previous month"
        >‹</button
      >
      <h1 class="font-bold">{monthLabel(month)}</h1>
      <button
        class="btn-quiet px-3 py-1"
        onclick={() => go(1)}
        disabled={month >= monthOf(NOW)}
        aria-label="Next month">›</button
      >
    </div>

    <div class="grid grid-cols-7 gap-1 text-center">
      {#each WEEKDAYS as weekday, i (i)}
        <div class="pb-1 text-xs text-mute">{weekday}</div>
      {/each}
      {#each monthCells(month) as day, i (day ?? `blank-${i}`)}
        {#if !day}
          <div></div>
        {:else}
          {@const tracked = logs[day]}
          <button
            class="flex h-12 flex-col sm:h-14 items-center justify-center gap-1 text-sm disabled:opacity-30
              {tracked ? 'bg-raise' : ''}
              {day === selected ? 'ring-2 ring-ember' : ''}
              {day === NOW ? 'font-black text-ember' : tracked ? 'text-text' : 'text-mute'}"
            disabled={day > NOW}
            aria-pressed={day === selected}
            aria-label={dayLabel(day)}
            onclick={() => (selected = day)}
          >
            {Number(day.slice(8))}
            <span class="flex h-1.5 gap-0.5">
              {#each app.habits as habit (habit.id)}
                {#if tracked?.[habit.id]}
                  <span
                    class="h-1.5 w-1.5 {habit.kind === 'quit'
                      ? 'bg-ember'
                      : 'bg-moss'}"
                  ></span>
                {/if}
              {/each}
            </span>
          </button>
        {/if}
      {/each}
    </div>

    <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
      <span><span class="inline-block h-2 w-2 bg-ember"></span> did a vice</span>
      <span><span class="inline-block h-2 w-2 bg-moss"></span> did a good habit</span>
      <span
        ><span class="inline-block h-2 w-2 bg-raise ring-1 ring-line"></span> tracked</span
      >
    </p>
  </section>

  <section class="card mt-3">
    <div class="mb-3 flex items-baseline justify-between">
      <h2 class="font-bold">{dayLabel(selected)}</h2>
      <span class="text-xs {record ? 'text-moss' : 'text-mute'}">
        {record ? 'tracked' : 'not tracked yet'}
      </span>
    </div>
    <p class="mb-3 text-sm text-mute">Tap everything you did this day.</p>

    <div class="flex flex-col gap-2">
      {#each app.habits as habit (habit.id)}
        {@const on = doneIds.includes(habit.id)}
        {@const quit = habit.kind === 'quit'}
        <button
          class="flex items-center justify-between border px-4 py-3 text-left transition active:scale-[0.98]
            {on ? (quit ? 'border-ember bg-ember/15' : 'border-moss bg-moss/15') : 'border-line'}"
          aria-pressed={on}
          disabled={saving}
          onclick={() => toggle(habit.id)}
        >
          <span class="font-semibold">{habit.name}</span>
          <span class="text-sm {on ? (quit ? 'text-ember' : 'text-moss') : 'text-mute'}">
            {#if on}
              {KIND_COPY[habit.kind].done}
            {:else if record}
              {quit ? 'clean' : 'not today'}
            {:else}
              —
            {/if}
          </span>
        </button>
      {/each}
    </div>

    {#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

    <div class="mt-3 flex gap-2">
      {#if !record}
        <button class="btn-quiet flex-1" disabled={saving} onclick={() => save([])}>
          None of these today
        </button>
      {:else}
        <button class="text-sm text-mute underline" onclick={clearDay}>Clear this day</button>
      {/if}
    </div>
  </section>
{/if}
