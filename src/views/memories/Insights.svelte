<script>
  // Stats: how much, how often, when, and what worked. Everything is worked out on this device from the
  // imported posts (src/views/memories/stats.js).
  import BarChart from '../../components/BarChart.svelte';
  import MemoryCard from '../../components/MemoryCard.svelte';
  import { KINDS } from '#lib/memories.js';
  import { href } from '#lib/router.svelte.js';
  import { memories } from './state.svelte.js';
  import { WEEKDAYS, computeStats } from './stats.js';

  const DAY_FORMAT = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const RANGE_FORMAT = { month: 'short', day: 'numeric', year: 'numeric' };
  const MONTH_FORMAT = { month: 'short', year: 'numeric' };
  const PERCENT = 100;
  const HOURS_PER_TICK = 6;
  const STAGGER_MS = 30;

  const s = $derived(computeStats(memories.list));
  const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, DAY_FORMAT);
  const rangeLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, RANGE_FORMAT);
  const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  const peakOf = (values) => values.indexOf(Math.max(...values));

  const tiles = $derived([
    ['Posts', s.total.toLocaleString(), `over ${s.spanDays.toLocaleString()} days`],
    [
      'Days you posted',
      s.activeDays.toLocaleString(),
      `${Math.round((s.activeDays / Math.max(1, s.spanDays)) * PERCENT)}% of all days`
    ],
    [
      'Longest streak',
      `${s.streaks.best.length} days`,
      s.streaks.best.length ? `${rangeLabel(s.streaks.best.from)} to ${rangeLabel(s.streaks.best.to)}` : ''
    ],
    ['Per day you post', s.perActiveDay.toFixed(1), 'posts on average'],
    ['Likes received', s.likes.toLocaleString(), `${s.overall.toFixed(2)} per post (likes + reposts)`],
    ['Reposts received', s.reposts.toLocaleString(), ''],
    ['Current streak', `${s.streaks.current.length} days`, s.streaks.current.length ? 'keep going' : 'post today to start one'],
    [
      'Busiest month',
      s.busiestMonth ? new Date(`${s.busiestMonth.month}-01T12:00:00`).toLocaleDateString(undefined, MONTH_FORMAT) : '—',
      s.busiestMonth ? `${s.busiestMonth.count.toLocaleString()} posts` : ''
    ]
  ]);
  const topMove = $derived(Math.max(1, ...s.moves.wins.map((m) => m.lift)));
  const topPerson = $derived(Math.max(1, ...s.people.map((p) => p.count)));
</script>

{#if !s.total}
  <p class="card mt-3 text-mute">Stats need posts from X. Import your archive first.</p>
{:else}
  <section class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
    {#each tiles as [name, value, note], i (name)}
      <div class="card rise flex min-w-0 flex-col gap-1" style="--rise-delay: {i * STAGGER_MS}ms">
        <span class="label">{name}</span>
        <span class="text-2xl leading-tight font-bold break-words">{value}</span>
        {#if note}<span class="text-xs text-mute">{note}</span>{/if}
      </div>
    {/each}
  </section>

  <section class="card mt-3 flex flex-wrap gap-x-6 gap-y-2" aria-label="By kind">
    {#each Object.entries(s.byKind) as [kind, count] (kind)}
      <span class="font-mono text-sm"><span class="text-mute uppercase">{KINDS[kind]}</span> {count.toLocaleString()}</span>
    {/each}
  </section>

  <section class="card mt-3 flex flex-col gap-5">
    <h2 class="text-lg">When you post</h2>
    <BarChart
      name="Posts per year"
      bars={s.perYear.map((y) => ({ label: String(y.year), value: y.count, tick: String(y.year) }))}
      summary="{s.perYear.length} years"
    />
    <BarChart
      name="By weekday"
      bars={s.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value, tick: WEEKDAYS[i] }))}
      summary="Most on {WEEKDAYS[peakOf(s.weekdays)]}"
    />
    <BarChart
      name="By hour"
      bars={s.hours.map((value, h) => ({ label: hourLabel(h), value, tick: h % HOURS_PER_TICK ? '' : hourLabel(h) }))}
      summary="Most at {hourLabel(peakOf(s.hours))}"
    />
  </section>

  <section class="card mt-3">
    <h2 class="text-lg">Most posts in a day</h2>
    <ol class="mt-2 flex flex-col">
      {#each s.busiestDays as { day, count }, i (day)}
        <li class="flex items-baseline gap-3 border-b border-line py-2 last:border-0">
          <span class="w-6 font-mono text-sm text-mute">{i + 1}</span>
          <a class="min-w-0 flex-1 truncate underline" href={href('memories', `timeline/${day.slice(0, 7)}`)}>{dayLabel(day)}</a>
          <span class="font-mono text-sm">{count}</span>
        </li>
      {/each}
    </ol>
  </section>

  <section class="mt-3">
    <div class="mb-2 flex items-baseline justify-between">
      <h2 class="text-lg">Most engaged</h2>
      <a class="text-sm text-moss underline" href={href('memories', 'hits')}>All greatest hits</a>
    </div>
    <div class="flex flex-col gap-3">
      {#each s.mostEngaged as memory, i (memory.id)}
        <MemoryCard {memory} index={i} />
      {/each}
    </div>
  </section>

  <section class="card mt-3">
    <h2 class="text-lg">Best moves</h2>
    <p class="mt-1 text-sm text-mute">
      What got more likes and reposts than your average post ({s.overall.toFixed(2)}). Groups of fewer than
      20 posts are left out.
    </p>
    {#if s.moves.wins.length}
      <ul class="mt-3 flex flex-col gap-3">
        {#each s.moves.wins as move (move.label)}
          <li>
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span>{move.label}</span>
              <span class="font-mono text-moss">{move.lift.toFixed(1)}×</span>
            </div>
            <div class="mt-1 h-1.5 bg-raise">
              <div class="bar-grow-x h-full bg-moss" style="width: {(move.lift / topMove) * PERCENT}%"></div>
            </div>
            <span class="label">{move.n.toLocaleString()} posts</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-3 text-sm text-mute">Nothing stands out yet.</p>
    {/if}
    {#if s.moves.flops.length}
      <h3 class="mt-5 text-base">What falls flat</h3>
      <ul class="mt-2 flex flex-col gap-1">
        {#each s.moves.flops as move (move.label)}
          <li class="flex items-baseline justify-between gap-3 text-sm text-mute">
            <span>{move.label}</span><span class="font-mono">{move.lift.toFixed(1)}×</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if s.people.length}
    <section class="card mt-3">
      <h2 class="text-lg">Who you reply to most</h2>
      <ul class="mt-3 flex flex-col gap-2">
        {#each s.people as person (person.name)}
          <li class="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span class="truncate">@{person.name}</span>
            <span class="h-1.5 bg-raise"><span class="bar-grow-x block h-full bg-moss" style="width: {(person.count / topPerson) * PERCENT}%"></span></span>
            <span class="font-mono">{person.count.toLocaleString()}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}
