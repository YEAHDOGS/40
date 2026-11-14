<script module>
  // The tab the indicator was last under, so it slides from there when the screen remounts on a tab change.
  let lastTab = 0;
</script>

<script>
  // Memories: posts and notes imported from other networks, shown on the day they happened in every year,
  // and searchable. Kept on this device only (src/lib/memories.js); never posted and never wiped.
  import { onMount } from 'svelte';
  import { app } from '#lib/app.svelte.js';
  import { KINDS } from '#lib/memories.js';
  import { href } from '#lib/router.svelte.js';
  import Search from './memories/Search.svelte';
  import Sources from './memories/Sources.svelte';
  import Today from './memories/Today.svelte';
  import { memories, prefs, toggleKind } from './memories/state.svelte.js';

  // [route param, label, screen]
  const TABS = [
    ['', 'On this day', Today],
    ['all', 'Search', Search],
    ['sources', 'Import', Sources]
  ];
  const SOURCES_TAB = 2;

  let { id = '' } = $props();

  let error = $state('');
  const requested = $derived(Math.max(0, TABS.findIndex(([param]) => param === id)));
  // Nothing imported yet: every tab is the import screen.
  const empty = $derived(memories.list?.length === 0);
  const tab = $derived(empty ? SOURCES_TAB : requested);
  const Screen = $derived(TABS[tab][2]);
  const kinds = $derived(
    Object.keys(KINDS).filter((kind) => memories.list?.some((m) => m.kind === kind))
  );

  onMount(() => {
    memories.load(app.user.id).catch((err) => (error = err.message || 'Cannot open memories here.'));
  });

  // The indicator slides in from the tab it was under before this screen remounted (CSS: .tab-slide).
  const slideFrom = lastTab;
  $effect(() => {
    lastTab = tab;
  });
</script>

<nav class="relative mt-2 grid grid-cols-3 border border-line bg-panel" aria-label="Memories">
  {#each TABS as [param, label], i (param)}
    <a
      href={href('memories', param)}
      class="relative z-10 px-2 py-3 text-center font-mono text-xs uppercase tracking-widest transition-colors duration-150 sm:text-sm
        {tab === i ? 'text-ink' : 'text-mute hover:text-moss'}"
      aria-current={tab === i ? 'page' : undefined}>{label}</a
    >
  {/each}
  <span
    class="tab-slide absolute inset-y-0 left-0 w-1/3 bg-moss"
    style="transform: translateX({tab * 100}%); --slide-from: {slideFrom * 100}%"
    aria-hidden="true"
  ></span>
</nav>

{#if error}
  <p class="card mt-3 text-sm text-ember" role="alert">{error}</p>
{:else if !memories.list}
  <p class="mt-3 font-mono text-sm text-mute">&gt; Opening memories…</p>
{:else}
  {#if tab !== SOURCES_TAB && kinds.length > 1}
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
  <Screen />
{/if}
