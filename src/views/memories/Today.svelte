<script>
  // On this day: every memory from one calendar day, in every year, grouped by year. Arrows, the arrow
  // keys and a sideways swipe move between days.
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import MemoryCard from '../../components/MemoryCard.svelte';
  import { daysFor, monthDay } from '#lib/memories.js';
  import { byYear } from './browse.js';
  import { memories, prefs } from './state.svelte.js';

  // Any leap year: day arithmetic runs in it so Feb 29 is reachable.
  const LEAP_YEAR = 2000;
  const SWIPE_MIN = 60;
  const SWIPE_MAX_DRIFT = 40;
  const SLIDE_PX = 24;
  const EDITABLE = 'input, textarea, select, [contenteditable]';
  const TODAY = monthDay(Date.now());
  const THIS_YEAR = new Date().getFullYear();

  let md = $state(TODAY);
  // Which way the last day change went, so the list slides in from that side.
  let direction = $state(0);

  const [month, date] = $derived(md.split('-').map(Number));
  const label = $derived(
    new Date(LEAP_YEAR, month - 1, date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  );
  const found = $derived(
    memories.list.filter((m) => daysFor(md).includes(m.md) && !prefs.hidden.includes(m.kind))
  );
  const groups = $derived(byYear(found));

  /** @param {number} step days */
  function shift(step) {
    direction = Math.sign(step);
    md = monthDay(new Date(LEAP_YEAR, month - 1, date + step).getTime());
  }

  function surprise() {
    const pool = memories.list.filter((m) => !prefs.hidden.includes(m.kind) && m.md !== md);
    if (!pool.length) return;
    direction = 1;
    md = pool[Math.floor(Math.random() * pool.length)].md;
  }

  const yearsAgo = (year) =>
    year === THIS_YEAR ? 'This year' : `${THIS_YEAR - year} year${THIS_YEAR - year === 1 ? '' : 's'} ago`;

  function onkeydown(event) {
    if (event.target.closest?.(EDITABLE) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') shift(-1);
    if (event.key === 'ArrowRight') shift(1);
  }

  /** Sideways swipes change the day; the arrow buttons and keys do the same. @param {HTMLElement} node */
  function swipe(node) {
    let start = null;
    const down = (event) => {
      const t = event.touches[0];
      start = { x: t.clientX, y: t.clientY };
    };
    const up = (event) => {
      if (!start) return;
      const t = event.changedTouches[0];
      const dx = t.clientX - start.x;
      const drift = Math.abs(t.clientY - start.y);
      start = null;
      if (Math.abs(dx) < SWIPE_MIN || drift > SWIPE_MAX_DRIFT) return;
      shift(dx < 0 ? 1 : -1);
    };
    node.addEventListener('touchstart', down, { passive: true });
    node.addEventListener('touchend', up, { passive: true });
    return () => {
      node.removeEventListener('touchstart', down);
      node.removeEventListener('touchend', up);
    };
  }
</script>

<svelte:window {onkeydown} />

<div class="min-h-[60dvh]" {@attach swipe}>
  <section class="card mt-3">
    <div class="flex items-center gap-2">
      <button class="btn-quiet px-3 py-2" onclick={() => shift(-1)} aria-label="Day before">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <div class="min-w-0 flex-1 text-center">
        <h1 class="truncate text-xl sm:text-2xl">{label}</h1>
        <p class="label mt-0.5" aria-live="polite">
          {found.length}
          {found.length === 1 ? 'memory' : 'memories'} · {groups.length}
          {groups.length === 1 ? 'year' : 'years'}
        </p>
      </div>
      <button class="btn-quiet px-3 py-2" onclick={() => shift(1)} aria-label="Day after">
        <ChevronRight class="h-5 w-5" />
      </button>
    </div>
    <div class="mt-3 flex justify-center gap-2">
      <button class="btn-quiet px-3 py-1.5 text-xs" disabled={md === TODAY} onclick={() => ((direction = -1), (md = TODAY))}>
        Today
      </button>
      <button class="btn-quiet px-3 py-1.5 text-xs" onclick={surprise}>
        <Shuffle class="h-4 w-4" /> Any day
      </button>
    </div>
  </section>

  {#key md}
    <div
      class="day-slide mt-3 flex flex-col gap-3"
      style="--slide-from: {direction * SLIDE_PX}px"
    >
      {#each groups as [year, list] (year)}
        <section class="flex flex-col gap-3" aria-label="{year}, {yearsAgo(year)}">
          <h2 class="rise flex items-baseline gap-3 border-b border-line pb-1 text-lg">
            {year}<span class="label">{yearsAgo(year)}</span>
            <span class="label ml-auto">{list.length}</span>
          </h2>
          {#each list as memory, i (memory.id)}
            <MemoryCard {memory} index={i} />
          {/each}
        </section>
      {:else}
        <p class="card rise text-mute">
          Nothing from {label} in any year. Swipe, use the arrows, or try any day.
        </p>
      {/each}
    </div>
  {/key}
</div>
