<script>
  // One whole thread: from its first post down every branch of replies, with the post you came from
  // outlined. When the first post answers someone else, their post is shown if the archive has its text.
  import { isTauri } from '@tauri-apps/api/core';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import { onMount } from 'svelte';
  import ThreadTree from '../../components/ThreadTree.svelte';
  import { href } from '#lib/router.svelte.js';
  import { memories } from './state.svelte.js';
  import { countBelow, parentId, rootOf, threadIndex } from './threads.js';

  const STATUS_URL = 'https://x.com/i/status/';
  const CAN_OPEN_LINKS = !isTauri();

  /** @type {{ id: string }} memory id */
  let { id } = $props();

  const threads = $derived(threadIndex(memories.list));
  const memory = $derived(threads.byId.get(id));
  const root = $derived(memory ? rootOf(threads, memory) : null);
  const answered = $derived(root?.parent && !threads.byId.has(parentId(root)) ? root.parent : null);
  const total = $derived(root ? countBelow(threads, root) + 1 : 0);

  function back() {
    if (history.length > 1) history.back();
    else location.hash = href('memories', 'timeline');
  }

  onMount(() => {
    // Bring the post you came from into view; it may sit deep in the thread.
    document.getElementById(`memory-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<div class="mt-3 flex items-center gap-3">
  <button class="btn-quiet px-3 py-1.5 text-xs" onclick={back}><ArrowLeft class="h-4 w-4" />Back</button>
  {#if root}<span class="label">Thread · {total} {total === 1 ? 'post' : 'posts'}</span>{/if}
</div>

{#if !root}
  <p class="card mt-3 text-mute">This post is not in your memories.</p>
{:else}
  <div class="mt-3 flex flex-col gap-3">
    {#if answered}
      <aside class="card border-dashed">
        <p class="label">Replying to @{root.replyTo ?? 'someone'}</p>
        {#if memories.context.get(answered)}
          <p class="mt-2 break-words whitespace-pre-wrap text-mute">{memories.context.get(answered)}</p>
          <p class="mt-2 text-xs text-mute">From your likes: X's archive has no one else's posts.</p>
        {:else}
          <p class="mt-2 text-sm text-mute">
            Their post is not in your archive: X only exports your own posts.
          </p>
        {/if}
        {#if CAN_OPEN_LINKS}
          <a class="mt-2 inline-block text-sm underline" href={STATUS_URL + answered} target="_blank" rel="noopener noreferrer">
            Open it on X
          </a>
        {/if}
      </aside>
    {/if}
    <ThreadTree memory={root} {threads} focus={id} linked={Boolean(answered)} />
  </div>
{/if}
