<script>
  // One imported memory: a post from X or a Google Keep note or list. Search words are highlighted. A reply
  // shows what it answered when that is known, and links to its whole thread.
  import { isTauri } from '@tauri-apps/api/core';
  import Check from '@lucide/svelte/icons/check';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Heart from '@lucide/svelte/icons/heart';
  import Repeat2 from '@lucide/svelte/icons/repeat-2';
  import { SOURCES } from '#lib/memories.js';
  import { href } from '#lib/router.svelte.js';
  import MemoryMedia from './MemoryMedia.svelte';
  import { highlight } from '../views/memories/browse.js';
  import { memories } from '../views/memories/state.svelte.js';
  import { countBelow, parentId, rootOf, threadIndex } from '../views/memories/threads.js';

  // One of each kind (src/lib/memories.js KINDS holds the plurals for the filters).
  const KIND_NAMES = { tweet: 'Post', reply: 'Reply', retweet: 'Repost', quote: 'Quote', note: 'Note', list: 'List' };
  const MAX_STAGGER = 12;
  const STAGGER_MS = 30;
  const DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  // The packaged apps have no way to open a browser tab yet, so outside links show on the web only.
  const CAN_OPEN_LINKS = !isTauri();

  /**
   * inThread: drawn inside a thread, where the parent is already above it. linked: draws the spine up to
   * the card above.
   * @type {{ memory: any, words?: string[], index?: number, focus?: boolean, inThread?: boolean, linked?: boolean }}
   */
  let { memory, words = [], index = 0, focus = false, inThread = false, linked = false } = $props();

  const threads = $derived(threadIndex(memories.list));
  const parent = $derived(parentId(memory) ? threads.byId.get(parentId(memory)) : null);
  // Someone else's post: its text is known only if you liked it.
  const answered = $derived(!parent && memory.parent ? memories.context.get(memory.parent) : null);
  const threadSize = $derived(
    memory.source === 'x' ? countBelow(threads, rootOf(threads, memory)) : 0
  );
</script>

{#snippet marked(text)}
  {#each highlight(text, words) as part, i (i)}
    {#if part.hit}<mark class="bg-moss/30 text-text">{part.text}</mark>{:else}{part.text}{/if}
  {/each}
{/snippet}

<article
  class="card rise {memory.source === 'keep' ? 'border-l-4 border-l-moss' : ''} {focus ? 'ring-2 ring-ember' : ''}
    {linked ? 'spine' : ''}"
  style="--rise-delay: {Math.min(index, MAX_STAGGER) * STAGGER_MS}ms"
  id="memory-{memory.id}"
>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase">
    <span class="border border-line px-1.5 py-0.5 text-moss">{SOURCES[memory.source]?.short}</span>
    <span class="text-mute">{KIND_NAMES[memory.kind] ?? memory.kind}</span>
    {#if memory.deleted}<span class="border border-ember px-1.5 py-0.5 text-ember">Deleted</span>{/if}
    <time class="ml-auto text-right text-ember" datetime={new Date(memory.at).toISOString()}>
      {new Date(memory.at).toLocaleString(undefined, DATE_FORMAT)}
    </time>
  </div>

  {#if !inThread && (parent || answered)}
    <blockquote class="mt-2 border-l-2 border-line pl-3 text-sm text-mute">
      <span class="label block">
        {parent ? 'Replying to your post' : `Replying to @${memory.replyTo} (a post you liked)`}
      </span>
      <span class="line-clamp-3 break-words whitespace-pre-wrap">{parent ? parent.text : answered}</span>
    </blockquote>
  {:else if memory.replyTo && !inThread}
    <p class="mt-2 text-xs text-mute">replying to @{memory.replyTo}</p>
  {/if}
  {#if memory.title}<h3 class="mt-2 text-base">{@render marked(memory.title)}</h3>{/if}
  {#if memory.text}
    <p class="mt-2 break-words whitespace-pre-wrap">{@render marked(memory.text)}</p>
  {/if}

  {#if memory.items}
    <ul class="mt-2 flex flex-col gap-1 text-sm">
      {#each memory.items as item, i (i)}
        <li class="flex items-start gap-2 {item.done ? 'text-mute line-through' : ''}">
          <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-line">
            {#if item.done}<Check class="h-3 w-3 text-moss" />{/if}
          </span>
          <span class="break-words">{@render marked(item.text)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <MemoryMedia {memory} />

  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute empty:hidden">
    {#each memory.labels ?? [] as label (label)}
      <span class="label border border-line px-1.5 py-0.5">{label}</span>
    {/each}
    {#if memory.likes}
      <span class="flex items-center gap-1"><Heart class="h-4 w-4" />{memory.likes}</span>
    {/if}
    {#if memory.reposts}
      <span class="flex items-center gap-1"><Repeat2 class="h-4 w-4" />{memory.reposts}</span>
    {/if}
    {#if threadSize && !inThread}
      <a class="flex items-center gap-1 text-moss underline" href={href('memories', `thread/${memory.id}`)}>
        <GitBranch class="h-4 w-4" />Thread of {threadSize + 1}
      </a>
    {/if}
    {#if memory.url && CAN_OPEN_LINKS}
      <a class="ml-auto underline" href={memory.url} target="_blank" rel="noopener noreferrer">
        Open on {SOURCES[memory.source]?.short}
      </a>
    {/if}
  </div>
</article>
