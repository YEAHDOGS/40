<script>
  // Shown when posts have photos and videos inside an archive that is not open in this session: one click
  // to allow it again (Chromium keeps the file handle), or pick the same .zip again elsewhere.
  import Images from '@lucide/svelte/icons/images';
  import { allowArchive, archives, reconnectArchive } from '#lib/archive.svelte.js';
  import { memories } from './state.svelte.js';

  // Archive names carry a long hash: show the start and the extension.
  const NAME_HEAD = 20;
  const NAME_TAIL = 4;
  const NAME_MAX = 32;
  const shortName = (name) =>
    name.length > NAME_MAX ? `${name.slice(0, NAME_HEAD)}…${name.slice(-NAME_TAIL)}` : name;

  let error = $state('');

  const closed = $derived(archives.known.filter((r) => !archives.open[r.key]));
  const waiting = $derived(
    closed.length > 0 && memories.list.some((m) => m.files?.some((f) => !archives.open[f.archive]))
  );

  async function allow(record) {
    error = '';
    try {
      if (!(await allowArchive(record))) error = 'Permission was not given.';
    } catch {
      error = 'The archive could not be opened. Has it moved? Pick it again instead.';
    }
  }

  function pick(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    error = reconnectArchive(file) ? '' : 'That is not the archive your memories came from.';
  }
</script>

{#if waiting}
  <section class="card rise mt-3 flex flex-col gap-2 border-moss sm:flex-row sm:items-center">
    <Images class="h-6 w-6 shrink-0 text-moss" />
    <p class="min-w-0 flex-1 text-sm">
      Your photos and videos are inside <span class="font-mono break-all" title={closed[0].name}>{shortName(closed[0].name)}</span>.
      Open it to see them here; nothing is copied.
    </p>
    {#if closed[0].handle}
      <button class="btn-quiet shrink-0 px-3 py-1.5 text-xs" onclick={() => allow(closed[0])}>Show media</button>
    {:else}
      <label class="btn-quiet shrink-0 cursor-pointer px-3 py-1.5 text-xs">
        Pick the .zip
        <input class="sr-only" type="file" accept=".zip" onchange={pick} />
      </label>
    {/if}
  </section>
  {#if error}<p class="mt-2 text-sm text-ember" role="alert">{error}</p>{/if}
{/if}
