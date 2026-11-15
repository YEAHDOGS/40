<script>
  // The account backup of memory text: turn it on, see how much of the 100 rows it uses, sync, restore on a
  // new device, or delete it. Photos and videos are never part of it (./backup.js).
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import { app } from '#lib/app.svelte.js';
  import { MAX_CHUNKS } from './backup.js';
  import { backup, deleteBackup, syncBackup } from './backup.svelte.js';
  import { memories } from './state.svelte.js';

  const MB = 1e6;
  const PERCENT = 100;

  const rows = $derived(backup.chunks?.length ?? 0);
  const saved = $derived(backup.chunks?.reduce((n, c) => n + c.count, 0) ?? 0);
  const size = $derived(((backup.chunks?.reduce((n, c) => n + c.bytes, 0) ?? 0) / MB).toFixed(1));
  const local = $derived(memories.list?.length ?? 0);

  async function remove() {
    if (!confirm('Delete the backup from your account? This device keeps its memories.')) return;
    await deleteBackup(app.user.id);
  }
</script>

{#if backup.supported && backup.chunks && (rows || local)}
  <section class="card rise mt-3 flex flex-col gap-3 {rows && !local ? 'border-moss' : ''}" aria-busy={backup.busy}>
    <div class="flex items-start gap-3">
      {#if rows && !local}
        <CloudDownload class="h-6 w-6 shrink-0 text-moss" />
      {:else}
        <Cloud class="h-6 w-6 shrink-0 {rows ? 'text-moss' : 'text-mute'}" />
      {/if}
      <div class="min-w-0 flex-1">
        <h2 class="text-base">
          {#if !rows}Back up the text to your account{:else if !local}Your account has a backup{:else}Backed up to your account{/if}
        </h2>
        <p class="mt-1 text-sm text-mute">
          {#if !rows}
            Keep the words of your posts and notes with your account, so another device can restore them.
            Photos and videos are never sent: they stay in your archive on this device.
          {:else}
            {saved.toLocaleString()} memories, compressed into {rows} of {MAX_CHUNKS} rows ({size} MB). Text
            only; photos and videos stay in your archive.
          {/if}
        </p>
      </div>
    </div>

    {#if rows}
      <div class="h-1.5 bg-raise" role="img" aria-label="{rows} of {MAX_CHUNKS} rows used">
        <div class="bar-grow-x h-full bg-moss" style="width: {(rows / MAX_CHUNKS) * PERCENT}%"></div>
      </div>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if !rows}
        <button class="btn-quiet px-3 py-1.5 text-xs" disabled={backup.busy} onclick={() => syncBackup(app.user.id)}>
          {backup.busy ? 'Backing up…' : 'Back up text'}
        </button>
      {:else if !local}
        <button class="btn px-3 py-1.5 text-xs" disabled={backup.busy} onclick={() => syncBackup(app.user.id)}>
          {backup.busy ? 'Restoring…' : `Restore ${saved.toLocaleString()} memories`}
        </button>
      {:else}
        <button class="btn-quiet px-3 py-1.5 text-xs" disabled={backup.busy} onclick={() => syncBackup(app.user.id)}>
          {backup.busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button class="btn-quiet px-3 py-1.5 text-xs" disabled={backup.busy} onclick={remove}>Delete backup</button>
      {/if}
    </div>

    <div aria-live="polite">
      {#if backup.status}<p class="font-mono text-sm text-moss">&gt; {backup.status}</p>{/if}
      {#if backup.error}<p class="text-sm text-ember" role="alert">{backup.error}</p>{/if}
    </div>
  </section>
{/if}
