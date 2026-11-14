<script>
  // Greatest hits: your most liked and reposted posts, all time or by year, plus the top post of each year.
  // Reposts of other people never count: only your own words.
  import MemoryCard from '../../components/MemoryCard.svelte';
  import { yearsOf } from './browse.js';
  import { memories, prefs } from './state.svelte.js';
  import { greatestHits, hitOfEachYear } from './stats.js';

  const PAGE = 10;
  const PODIUM = 3;
  const MAX_STAGGER = 12;
  const STAGGER_MS = 30;
  const MEASURES = { both: 'Likes + reposts', likes: 'Likes', reposts: 'Reposts' };

  let year = $state('');
  let by = $state('both');
  let shown = $state(PAGE);

  const hits = $derived(greatestHits(memories.list, { year, by, hidden: prefs.hidden }));
  const years = $derived(yearsOf(memories.list.filter((m) => m.source === 'x')));
  const eachYear = $derived(hitOfEachYear(memories.list));

  // A new year or measure starts back at the top ten.
  $effect(() => {
    void hits;
    shown = PAGE;
  });
</script>

{#if eachYear.length > 1 && !year}
  <section class="mt-3">
    <h2 class="mb-2 text-lg">Hit of each year</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each eachYear as [y, memory], i (y)}
        <div class="flex min-w-0 flex-col gap-1">
          <span class="label">{y}</span>
          <MemoryCard {memory} index={i} />
        </div>
      {/each}
    </div>
  </section>
{/if}

<section class="card mt-3 grid grid-cols-2 gap-2">
  <select class="field py-2" bind:value={year} aria-label="Year">
    <option value="">All time</option>
    {#each years as y (y)}<option value={String(y)}>{y}</option>{/each}
  </select>
  <select class="field py-2" bind:value={by} aria-label="Ranked by">
    {#each Object.entries(MEASURES) as [value, name] (value)}<option {value}>{name}</option>{/each}
  </select>
</section>

<ol class="mt-3 flex flex-col gap-3">
  {#each hits.slice(0, shown) as memory, i (memory.id)}
    <li class="flex items-start gap-3">
      <span
        class="rise w-10 shrink-0 pt-3 text-right font-mono text-2xl font-bold {i < PODIUM ? 'text-ember' : 'text-mute'}"
        style="--rise-delay: {Math.min(i % PAGE, MAX_STAGGER) * STAGGER_MS}ms"
        aria-label="Number {i + 1}">{i + 1}</span
      >
      <div class="min-w-0 flex-1"><MemoryCard {memory} index={i % PAGE} /></div>
    </li>
  {:else}
    <li class="card text-mute">No likes or reposts {year ? `in ${year}` : 'yet'}.</li>
  {/each}
</ol>
{#if shown < hits.length}
  <button class="btn-quiet mt-3 w-full" onclick={() => (shown += PAGE)}>Next {PAGE}</button>
{/if}
