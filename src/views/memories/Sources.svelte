<script>
  // Import: pick or drop export files, see what is stored per source, and remove a source.
  import FileUp from '@lucide/svelte/icons/file-up';
  import { app } from '#lib/app.svelte.js';
  import { connectArchives } from '#lib/archive.svelte.js';
  import { SOURCES, removeSource, saveAll, saveMemories } from '#lib/memories.js';
  import { readExports } from './import.js';
  import { memories } from './state.svelte.js';

  const ACCEPT = '.zip,.js,.csv,.json';
  // For browsers with file handles (Chromium): the same choice, as a picker filter.
  const PICKER_TYPES = [
    {
      description: 'Exports',
      accept: {
        'application/zip': ['.zip'],
        'text/javascript': ['.js'],
        'text/csv': ['.csv'],
        'application/json': ['.json']
      }
    }
  ];
  const ABORT = 'AbortError';
  // Chromium hands out file handles, which let the archive's media reopen with one click next visit.
  const HAS_HANDLES = typeof window.showOpenFilePicker === 'function';
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

  /** @param {{ file: File, handle?: any }[]} picked */
  async function importFiles(picked) {
    if (!picked.length || busy) return;
    busy = true;
    problems = [];
    try {
      const files = picked.map((p) => p.file);
      const found = await readExports(files, (s) => (status = s));
      problems = found.skipped;
      if (found.archives.length) {
        await connectArchives(app.user.id, picked.filter((p) => found.archives.includes(p.file)));
      }
      if (found.context.length) await saveAll(app.user.id, 'context', found.context);
      if (found.memories.length) {
        status = `Saving ${found.memories.length.toLocaleString()} memories`;
        const { added } = await saveMemories(app.user.id, found.memories);
        await memories.load(app.user.id);
        const media = found.memories.reduce((n, m) => n + (m.files?.length ?? 0), 0);
        status = `Read ${found.memories.length.toLocaleString()}: ${added.toLocaleString()} new` +
          (media ? `, ${media.toLocaleString()} photos and videos linked.` : '.');
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

  async function ondrop(event) {
    event.preventDefault();
    dragging = false;
    // Handles have to be asked for during the drop event itself, before any await.
    const items = [...(event.dataTransfer?.items ?? [])].filter((item) => item.kind === 'file');
    const pending = items.map((item) => ({
      file: item.getAsFile(),
      handle: item.getAsFileSystemHandle?.().catch(() => null)
    }));
    const picked = [];
    for (const { file, handle } of pending) if (file) picked.push({ file, handle: (await handle) ?? undefined });
    importFiles(picked);
  }

  /** Chromium: pick through the file-handle picker so the archive can be reopened later. */
  async function pickWithHandles(event) {
    if (!HAS_HANDLES || busy) return;
    event.preventDefault();
    try {
      const handles = await window.showOpenFilePicker({ multiple: true, types: PICKER_TYPES });
      importFiles(await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle }))));
    } catch (err) {
      if (err?.name !== ABORT) problems = [err?.message || 'Those files could not be opened.'];
    }
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
  <span class="text-sm text-mute">
    Drop or pick an X archive (the whole .zip, even 6 GB: its photos and videos stay in it), tweets.js,
    tweets.csv, or a Google Keep Takeout.
  </span>
  <input
    class="sr-only"
    type="file"
    accept={ACCEPT}
    multiple
    disabled={busy}
    onclick={pickWithHandles}
    onchange={(event) => {
      importFiles([...(event.currentTarget.files ?? [])].map((file) => ({ file })));
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
