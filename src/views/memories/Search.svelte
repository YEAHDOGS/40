<script>
  // Search: every memory, filtered by words, year and source, in the chosen order. Draws a page at a time
  // as the end of the list comes into view.
  import SearchIcon from '@lucide/svelte/icons/search';
  import MemoryCard from '../../components/MemoryCard.svelte';
  import { SOURCES } from '#lib/memories.js';
  import { SORTS, browse, tokens, yearsOf } from './browse.js';
  import { memories, prefs, savePrefs } from './state.svelte.js';

  const PAGE = 40;
  // Start drawing the next page this far before the end of the list scrolls into view.
  const PRELOAD_MARGIN = '600px';

  let query = $state('');
  let year = $state('');
  let source = $state('');
  let shown = $state(PAGE);

  const words = $derived(tokens(query));
  const years = $derived(yearsOf(memories.list));
  const sources = $derived(Object.keys(SOURCES).filter((s) => memories.list.some((m) => m.source === s)));
  const results = $derived(
    browse(memories.list, { words, sort: prefs.sort, hidden: prefs.hidden, year, source })
  );

  // A new search starts back at the first page.
  $effect(() => {
    void results;
    shown = PAGE;
  });

  /** Draws more when the sentinel at the end of the list nears the screen. @param {Element} node */
  function more(node) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) shown += PAGE;
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

<section class="card mt-3 flex flex-col gap-2">
  <label class="relative block">
    <span class="sr-only">Search memories</span>
    <SearchIcon class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mute" />
    <input class="field pl-9" type="search" bind:value={query} placeholder="Search words, @names, labels" />
  </label>
  <div class="grid grid-cols-2 gap-2 {sources.length > 1 ? 'sm:grid-cols-3' : ''}">
    <select class="field py-2" bind:value={prefs.sort} onchange={savePrefs} aria-label="Order">
      {#each Object.entries(SORTS) as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
    <select class="field py-2" bind:value={year} aria-label="Year">
      <option value="">Every year</option>
      {#each years as y (y)}<option value={String(y)}>{y}</option>{/each}
    </select>
    {#if sources.length > 1}
      <select class="field col-span-2 py-2 sm:col-span-1" bind:value={source} aria-label="Source">
        <option value="">Everywhere</option>
        {#each sources as s (s)}<option value={s}>{SOURCES[s].name}</option>{/each}
      </select>
    {/if}
  </div>
  <p class="label" aria-live="polite">
    {results.length.toLocaleString()}
    {results.length === 1 ? 'memory' : 'memories'}
  </p>
</section>

<div class="mt-3 flex flex-col gap-3">
  {#each results.slice(0, shown) as memory, i (memory.id)}
    <MemoryCard {memory} {words} index={i % PAGE} />
  {:else}
    <p class="card rise text-mute">Nothing matches. Try fewer words, or turn kinds back on above.</p>
  {/each}
  {#if shown < results.length}
    <div class="h-px" {@attach more}></div>
    <button class="btn-quiet" onclick={() => (shown += PAGE)}>Show more</button>
  {/if}
</div>
