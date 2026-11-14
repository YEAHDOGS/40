<script>
  // Import: pick or drop export files, see what is stored per source, and remove a source.
  import FileUp from '@lucide/svelte/icons/file-up';
  import { app } from '#lib/app.svelte.js';
  import { SOURCES, removeSource, saveMemories } from '#lib/memories.js';
  import { readExports } from './import.js';
  import { memories } from './state.svelte.js';

  const ACCEPT = '.zip,.js,.csv,.json';
  const RANGE_FORMAT = { month: 'short', year: 'numeric' };
  const HOW_TO = {
    x: 'On x.com: Settings, Your account, Download an archive of your data. When it is ready, pick the .zip here, or just data/tweets.js from inside it. A tweets.csv works too.',
    keep: 'At takeout.google.com, deselect all, tick Keep, and export. Pick the .zip here, or the .json notes from its Takeout/Keep folder.'
  };

  let busy = $state(false);
  let dragging = $state(false);
  let status = $state('');
  let problems = $state([]);

  const stored = $derived(
    Object.keys(SOURCES).map((source) => {
      const list = memories.list.filter((m) => m.source === source);
      return { source, count: list.length, newest: list[0]?.at, oldest: list.at(-1)?.at };
    })
  );

  /** @param {FileList | File[]} files */
  async function importFiles(files) {
    if (!files.length || busy) return;
    busy = true;
    problems = [];
    try {
      const { memories: found, skipped } = await readExports([...files], (s) => (status = s));
      problems = skipped;
      if (found.length) {
        status = `Saving ${found.length.toLocaleString()} memories`;
        const { added } = await saveMemories(app.user.id, found);
        await memories.load(app.user.id);
        status = `Read ${found.length.toLocaleString()}: ${added.toLocaleString()} new.`;
      } else {
        status = '';
      }
    } catch (err) {
      status = '';
      problems = [err?.message || 'That import failed.'];
    }
    busy = false;
  }

  async function remove(source) {
    if (!confirm(`Remove every ${SOURCES[source].name} memory from this device?`)) return;
    await removeSource(app.user.id, source);
    await memories.load(app.user.id);
    status = `Removed ${SOURCES[source].name}.`;
  }

  function ondrop(event) {
    event.preventDefault();
    dragging = false;
    importFiles(event.dataTransfer?.files ?? []);
  }

  const range = (at) => new Date(at).toLocaleDateString(undefined, RANGE_FORMAT);
</script>

<label
  class="card mt-3 flex cursor-pointer flex-col items-center gap-2 border-dashed py-8 text-center transition-transform duration-150
    {dragging ? 'scale-[1.01] border-moss text-moss' : ''} {busy ? 'pointer-events-none opacity-70' : ''}"
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  {ondrop}
>
  <FileUp class="h-8 w-8 {busy ? 'animate-pulse text-moss' : 'text-ember'}" />
  <span class="text-lg font-bold uppercase">{busy ? 'Reading…' : 'Import memories'}</span>
  <span class="text-sm text-mute">Drop or pick an X archive, tweets.js, tweets.csv, or a Google Keep Takeout.</span>
  <input
    class="sr-only"
    type="file"
    accept={ACCEPT}
    multiple
    disabled={busy}
    onchange={(event) => {
      importFiles(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
    }}
  />
</label>

<div aria-live="polite">
  {#if status}<p class="mt-3 font-mono text-sm text-moss">&gt; {status}</p>{/if}
  {#each problems as problem (problem)}
    <p class="mt-2 text-sm text-ember" role="alert">{problem}</p>
  {/each}
</div>

<p class="mt-3 text-sm text-mute">
  Imports are read and kept on this device only. Nothing is uploaded, posted, or wiped by the 40-day
  cycle. Import the same file again any time: nothing is doubled.
</p>

<div class="mt-3 grid gap-3 sm:grid-cols-2">
  {#each stored as { source, count, newest, oldest } (source)}
    <section class="card flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-base">{SOURCES[source].name}</h2>
        <span class="label {count ? 'text-moss' : ''}">{count.toLocaleString()}</span>
      </div>
      {#if count}
        <p class="text-sm text-mute">{range(oldest)} to {range(newest)}</p>
        <button class="btn-quiet mt-auto py-1.5 text-xs" onclick={() => remove(source)}>Remove</button>
      {:else}
        <p class="text-sm text-mute">{HOW_TO[source]}</p>
      {/if}
    </section>
  {/each}
</div>
