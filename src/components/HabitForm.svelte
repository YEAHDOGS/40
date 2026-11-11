<script>
  import { api } from '#lib/api.js';
  import { KIND_COPY, VISIBILITY_COPY, app } from '#lib/app.svelte.js';

  const MAX_NAME = 40;

  let name = $state('');
  let kind = $state('quit');
  let visibility = $state('private');
  let error = $state('');
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const { habit } = await api('/api/habits', {
        method: 'POST',
        json: { name, kind, visibility }
      });
      app.habits.push(habit);
      name = '';
    } catch (err) {
      error = err.message;
    }
    busy = false;
  }
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
  <input
    class="field"
    bind:value={name}
    maxlength={MAX_NAME}
    placeholder="drinking, running, cinnamon toast crunch..."
    aria-label="What to track"
    required
  />
  <div class="grid grid-cols-2 gap-2">
    {#each Object.entries(KIND_COPY) as [value, copy] (value)}
      <button
        type="button"
        class=" border px-3 py-2 text-left {kind === value
          ? value === 'quit'
            ? 'border-ember bg-ember/15'
            : 'border-moss bg-moss/15'
          : 'border-line'}"
        aria-pressed={kind === value}
        onclick={() => (kind = value)}
      >
        <span class="block font-semibold">{copy.label}</span>
        <span class="block text-xs text-mute">{copy.hint}</span>
      </button>
    {/each}
  </div>
  <select class="field" bind:value={visibility} aria-label="Who can see it">
    {#each Object.entries(VISIBILITY_COPY) as [value, label] (value)}
      <option {value}>{label}</option>
    {/each}
  </select>
  {#if error}<p class="text-sm text-ember" role="alert">{error}</p>{/if}
  <button class="btn" disabled={busy}>Start tracking</button>
</form>
