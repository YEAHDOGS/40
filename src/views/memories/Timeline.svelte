<script>
  // Timeline: everything in order, month by month. Each entry is a tree: a post with your replies to it as
  // branches (the first few inline, the rest one tap away). The bar chart of posts per month jumps to a
  // month; drawing continues a page at a time as the end comes into view.
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import { onMount } from 'svelte';
  import BarChart from '../../components/BarChart.svelte';
  import MemoryCard from '../../components/MemoryCard.svelte';
  import { href } from '#lib/router.svelte.js';
  import { memories, prefs } from './state.svelte.js';
  import { countBelow, monthCounts, threadIndex, timelineMonths } from './threads.js';

  const PAGE = 30;
  const PRELOAD_MARGIN = '800px';
  // Replies drawn inline under a post before "more in this thread".
  const INLINE_REPLIES = 2;
  const ORDER_KEY = 'forty.memories.timeline-oldest';

  /** @type {{ month?: string }} 'YYYY-MM' to open at */
  let { month = '' } = $props();

  let oldest = $state(localStorage.getItem(ORDER_KEY) === '1');
  let start = $state(0);
  let shown = $state(PAGE);

  const threads = $derived(threadIndex(memories.list));
  const months = $derived(timelineMonths(memories.list, { hidden: prefs.hidden, oldest }));
  // One flat list of month headers and trees, so paging and jumping work across months.
  const rows = $derived(
    months.flatMap((m) => [{ month: m }, ...m.trees.map((memory) => ({ memory }))])
  );
  const visible = $derived(rows.slice(start, start + shown));
  const perMonth = $derived(
    monthCounts(memories.list).map((m) => ({
      label: m.label,
      value: m.count,
      key: m.key,
      tick: m.key.endsWith('-01') ? m.key.slice(0, 4) : ''
    }))
  );
  const busiest = $derived(perMonth.reduce((a, b) => (b.value > a.value ? b : a), perMonth[0]));

  /** The first replies down the spine of a tree, for the inline preview. */
  function inline(memory) {
    const out = [];
    let node = memory;
    while (out.length < INLINE_REPLIES) {
      const next = threads.children.get(node.id)?.[0];
      if (!next) break;
      out.push(next);
      node = next;
    }
    return out;
  }

  /** Starts the list at a month ('YYYY-MM'), or the nearest one with posts. @param {string} key */
  function jump(key) {
    const target = months.find((m) => (oldest ? m.key >= key : m.key <= key)) ?? months.at(-1);
    start = Math.max(0, rows.findIndex((r) => r.month === target));
    shown = PAGE;
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function flip() {
    oldest = !oldest;
    localStorage.setItem(ORDER_KEY, oldest ? '1' : '0');
    start = 0;
    shown = PAGE;
  }

  // Opened from a link to a month (Stats' busiest days). The screen remounts for every new link.
  onMount(() => {
    if (month) jump(month);
  });

  /** Draws more when the end of the list nears the screen. @param {Element} node */
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

<section class="card mt-3">
  <BarChart
    name="Posts per month · tap to jump"
    bars={perMonth}
    summary={busiest ? `Busiest: ${busiest.label}, ${busiest.value.toLocaleString()}` : ''}
    onpick={(i) => jump(perMonth[i].key)}
  />
  <div class="mt-3 flex flex-wrap items-center gap-2">
    <button class="btn-quiet px-3 py-1.5 text-xs" onclick={flip}>
      <ArrowUpDown class="h-4 w-4" />{oldest ? 'Oldest first' : 'Newest first'}
    </button>
    {#if start > 0}
      <button class="btn-quiet px-3 py-1.5 text-xs" onclick={() => ((start = 0), (shown = PAGE))}>
        Back to the {oldest ? 'beginning' : 'latest'}
      </button>
    {/if}
  </div>
</section>

<div class="mt-3 flex flex-col gap-3">
  {#if start > 0}
    <button class="btn-quiet" onclick={() => (start = Math.max(0, start - PAGE), (shown += PAGE))}>
      Show {oldest ? 'earlier' : 'newer'}
    </button>
  {/if}
  {#each visible as row, i (row.month?.key ?? row.memory.id)}
    {#if row.month}
      <h2 class="rise mt-2 flex items-baseline gap-3 border-b border-line pb-1 text-lg">
        {row.month.label}<span class="label ml-auto">{row.month.count.toLocaleString()}</span>
      </h2>
    {:else}
      {@const below = countBelow(threads, row.memory)}
      {@const preview = inline(row.memory)}
      <MemoryCard memory={row.memory} index={i % PAGE} inThread={false} />
      {#each preview as reply (reply.id)}
        <div class="ml-3 border-l-2 border-moss/40 pl-3">
          <MemoryCard memory={reply} inThread linked />
        </div>
      {/each}
      {#if below > preview.length}
        <a
          class="ml-3 border-l-2 border-moss/40 pl-3 font-mono text-xs uppercase tracking-widest text-moss underline"
          href={href('memories', `thread/${row.memory.id}`)}
        >
          {below - preview.length} more in this thread
        </a>
      {/if}
    {/if}
  {:else}
    <p class="card rise text-mute">Nothing to show. Turn kinds back on above.</p>
  {/each}
  {#if start + shown < rows.length}
    <div class="h-px" {@attach more}></div>
    <button class="btn-quiet" onclick={() => (shown += PAGE)}>Show more</button>
  {/if}
</div>
