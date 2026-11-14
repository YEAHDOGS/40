<script>
  // Memories: posts and notes imported from other networks. On this day across the years, a timeline of
  // threads, greatest hits, stats, search, and the import screen. Kept on this device only
  // (src/lib/memories.js); never posted and never wiped.
  //
  // Routes: #/memories[/<tab>[/<more>]], e.g. #/memories/timeline/2025-02, #/memories/thread/x:123.
  import { onMount } from 'svelte';
  import { app } from '#lib/app.svelte.js';
  import { KINDS } from '#lib/memories.js';
  import { href } from '#lib/router.svelte.js';
  import ArchiveBanner from './memories/ArchiveBanner.svelte';
  import Hits from './memories/Hits.svelte';
  import Insights from './memories/Insights.svelte';
  import Search from './memories/Search.svelte';
  import Sources from './memories/Sources.svelte';
  import Thread from './memories/Thread.svelte';
  import Timeline from './memories/Timeline.svelte';
  import Today from './memories/Today.svelte';
  import { memories, prefs, toggleKind } from './memories/state.svelte.js';

  // [route segment, label, screen, shows the kind filters]
  const TABS = [
    ['', 'Today', Today, true],
    ['timeline', 'Timeline', Timeline, true],
    ['hits', 'Hits', Hits, true],
    ['stats', 'Stats', Insights, false],
    ['all', 'Search', Search, true],
    ['sources', 'Import', Sources, false]
  ];
  const SOURCES_TAB = TABS.length - 1;
  const THREAD = 'thread';

  let { id = '' } = $props();

  let error = $state('');
  const [segment, ...rest] = $derived(id.split('/'));
  const more = $derived(rest.join('/'));
  const thread = $derived(segment === THREAD);
  // Nothing imported yet: every tab is the import screen.
  const empty = $derived(memories.list?.length === 0);
  const tab = $derived(
    empty ? SOURCES_TAB : Math.max(0, TABS.findIndex(([name]) => name === segment))
  );
  const Screen = $derived(TABS[tab][2]);
  const kinds = $derived(
    Object.keys(KINDS).filter((kind) => memories.list?.some((m) => m.kind === kind))
  );

  onMount(() => {
    memories.load(app.user.id).catch((err) => (error = err?.message || 'Cannot open memories here.'));
  });
</script>

<nav class="mt-2 grid grid-cols-3 border-t border-l border-line bg-panel sm:grid-cols-6" aria-label="Memories">
  {#each TABS as [name, label], i (name)}
    {@const on = !thread && tab === i}
    <a
      href={href('memories', name)}
      class="relative border-r border-b border-line px-1 py-3 text-center font-mono text-xs uppercase tracking-widest transition-colors duration-150
        {on ? 'text-ink' : 'text-mute hover:text-moss'}"
      aria-current={on ? 'page' : undefined}
    >
      {#if on}<span class="tab-on absolute inset-0 bg-moss" aria-hidden="true"></span>{/if}
      <span class="relative">{label}</span>
    </a>
  {/each}
</nav>

{#if error}
  <p class="card mt-3 text-sm text-ember" role="alert">{error}</p>
{:else if !memories.list}
  <p class="mt-3 font-mono text-sm text-mute">&gt; Opening memories…</p>
{:else}
  <ArchiveBanner />
  {#if !thread && TABS[tab][3] && kinds.length > 1}
    <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show these kinds">
      {#each kinds as kind (kind)}
        {@const on = !prefs.hidden.includes(kind)}
        <button
          class="chip {on ? 'border-moss text-moss' : 'border-line text-mute line-through'}"
          aria-pressed={on}
          onclick={() => toggleKind(kind)}>{KINDS[kind]}</button
        >
      {/each}
    </div>
  {/if}
  {#if thread}
    {#key more}<Thread id={more} />{/key}
  {:else}
    <Screen month={more} />
  {/if}
{/if}
