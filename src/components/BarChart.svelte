<script>
  // A one-series column chart: thin bars on a hairline baseline, the tallest in the brand accent. Hovering or
  // focusing a bar shows its value in the readout above the chart; clicking calls onpick.
  /**
   * @type {{
   *   name: string,
   *   bars: { label: string, value: number, tick?: string }[],
   *   unit?: string,
   *   summary?: string,
   *   onpick?: (index: number) => void,
   *   tall?: boolean
   * }}
   */
  let { name, bars, unit = 'posts', summary = '', onpick, tall = false } = $props();

  const STAGGER_MS = 12;
  const MAX_STAGGER = 40;

  let active = $state(-1);
  const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
  const peak = $derived(bars.findIndex((b) => b.value === max));
  const shown = $derived(bars[active]);
  const ticks = $derived(bars.some((b) => b.tick));
</script>

<figure class="min-w-0">
  <figcaption class="flex items-baseline justify-between gap-3">
    <span class="label">{name}</span>
    <span class="truncate font-mono text-xs text-text" aria-live="polite">
      {shown ? `${shown.label}: ${shown.value.toLocaleString()} ${unit}` : summary}
    </span>
  </figcaption>
  <div class="mt-2 flex items-end gap-0.5 border-b border-line {tall ? 'h-36' : 'h-24'}">
    {#each bars as bar, i (i)}
      <button
        type="button"
        class="flex h-full min-w-0 flex-1 items-end focus-visible:outline-1 focus-visible:outline-moss"
        aria-label="{bar.label}: {bar.value.toLocaleString()} {unit}"
        onmouseenter={() => (active = i)}
        onmouseleave={() => (active = -1)}
        onfocus={() => (active = i)}
        onblur={() => (active = -1)}
        onclick={() => onpick?.(i)}
        tabindex={onpick ? 0 : -1}
      >
        <span
          class="bar-grow mx-auto w-full max-w-4 rounded-t-xs transition-opacity duration-150
            {i === peak ? 'bg-ember' : 'bg-moss'} {active === -1 || active === i ? '' : 'opacity-40'}"
          style="height: {bar.value ? Math.max(2, (bar.value / max) * 100) : 0}%; --i: {Math.min(i, MAX_STAGGER) * STAGGER_MS}ms"
        ></span>
      </button>
    {/each}
  </div>
  {#if ticks}
    <div class="mt-1 flex gap-0.5" aria-hidden="true">
      {#each bars as bar, i (i)}
        <span class="label min-w-0 flex-1 overflow-visible text-center whitespace-nowrap text-[0.625rem]">{bar.tick ?? ''}</span>
      {/each}
    </div>
  {/if}
</figure>
