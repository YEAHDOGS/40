<script>
  // The home-screen nudge: how many memories happened on this day in earlier years. Hidden when none.
  import BookHeart from '@lucide/svelte/icons/book-heart';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { app } from '#lib/app.svelte.js';
  import { monthDay, onThisDay } from '#lib/memories.js';
  import { href } from '#lib/router.svelte.js';

  const THIS_YEAR = new Date().getFullYear();

  let years = $state([]);
  let count = $state(0);

  onThisDay(app.user.id, monthDay(Date.now()))
    .then((found) => {
      const past = found.filter((m) => new Date(m.at).getFullYear() < THIS_YEAR);
      count = past.length;
      years = [...new Set(past.map((m) => new Date(m.at).getFullYear()))];
    })
    // No IndexedDB here (some private windows): the nudge just stays hidden.
    .catch(() => {});

  const yearList = $derived(
    years.length > 1 ? `${years.slice(0, -1).join(', ')} and ${years.at(-1)}` : String(years[0])
  );
</script>

{#if count}
  <a href={href('memories')} class="card rise mb-3 flex items-center gap-3">
    <BookHeart class="h-6 w-6 shrink-0 text-ember" />
    <span class="min-w-0 flex-1">
      <span class="block font-bold uppercase">On this day</span>
      <span class="block text-sm text-mute">
        {count.toLocaleString()}
        {count === 1 ? 'memory' : 'memories'} from {yearList}
      </span>
    </span>
    <ChevronRight class="h-5 w-5 text-mute" />
  </a>
{/if}
