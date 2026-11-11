<script>
  // The split-flap countdown to the global wipe, from the original 40 build.
  // Styles: src/styles/clock.css. Skins: [data-clock] blocks in src/styles/theme.css.
  import Settings from '@lucide/svelte/icons/settings';
  import TimerIcon from '@lucide/svelte/icons/timer';
  import { CLOCK_SKINS } from '#lib/theme.js';

  const STORAGE_KEY = 'forty.clock';
  const SECOND = 1000;
  const ICON_SIZE = 14;
  // [label, milliseconds, wraps at]
  const UNITS = [
    ['Days', 86_400_000, Infinity],
    ['Hours', 3_600_000, 24],
    ['Mins', 60_000, 60],
    ['Secs', 1000, 60],
  ];

  /** @type {{ endsAt: number }} unix ms when the current cycle ends */
  let { endsAt } = $props();

  let now = $state(Date.now());
  let skin = $state(localStorage.getItem(STORAGE_KEY) || CLOCK_SKINS[0].id);
  let choosing = $state(false);

  const left = $derived(Math.max(0, endsAt - now));
  const tiles = $derived(
    UNITS.map(([label, size, wrap]) => [label, String(Math.floor(left / size) % wrap).padStart(2, '0')]),
  );

  $effect(() => {
    const tick = setInterval(() => (now = Date.now()), SECOND);
    return () => clearInterval(tick);
  });

  function choose(event) {
    skin = event.target.value;
    localStorage.setItem(STORAGE_KEY, skin);
  }
</script>

<div class="clock" data-clock={skin}>
  <div class="clock__hinge clock__hinge--left"></div>
  <div class="clock__hinge clock__hinge--right"></div>

  <div class="clock__head">
    <span class="clock__title"><TimerIcon size={ICON_SIZE} class="animate-pulse" /> Time to global wipe</span>
    <button
      class="clock__gear"
      onclick={() => (choosing = !choosing)}
      aria-label="Change the clock style"
      aria-expanded={choosing}
    >
      <Settings size={ICON_SIZE} />
    </button>
  </div>

  <div class="clock__tiles" role="timer" aria-label="Time until everything public is deleted">
    {#each tiles as [label, value], i (label)}
      {#if i}<span class="clock__colon">:</span>{/if}
      <div class="clock__tile">
        <div class="clock__flap"><span class="clock__digit">{value}</span></div>
        <span class="clock__unit">{label}</span>
      </div>
    {/each}
  </div>

  {#if choosing}
    <select class="clock__skins" value={skin} onchange={choose} aria-label="Clock style">
      {#each CLOCK_SKINS as option (option.id)}
        <option value={option.id}>{option.name}</option>
      {/each}
    </select>
  {/if}
</div>
