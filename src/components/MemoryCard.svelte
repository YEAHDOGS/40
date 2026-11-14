<script>
  // One imported memory: a post from X or a Google Keep note or list. Search words are highlighted.
  import { isTauri } from '@tauri-apps/api/core';
  import Check from '@lucide/svelte/icons/check';
  import Heart from '@lucide/svelte/icons/heart';
  import ImageOff from '@lucide/svelte/icons/image-off';
  import Play from '@lucide/svelte/icons/play';
  import Repeat2 from '@lucide/svelte/icons/repeat-2';
  import { SOURCES } from '#lib/memories.js';
  import { highlight } from '../views/memories/browse.js';

  // One of each kind (src/lib/memories.js KINDS holds the plurals for the filters).
  const KIND_NAMES = { tweet: 'Post', reply: 'Reply', retweet: 'Repost', quote: 'Quote', note: 'Note', list: 'List' };
  const MAX_MEDIA = 4;
  const MAX_STAGGER = 12;
  const STAGGER_MS = 30;
  const DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  // The packaged apps have no way to open a browser tab yet, so outside links show on the web only.
  const CAN_OPEN_LINKS = !isTauri();

  /** @type {{ memory: any, words?: string[], index?: number }} */
  let { memory, words = [], index = 0 } = $props();

  const media = $derived((memory.media ?? []).filter((m) => m.thumb).slice(0, MAX_MEDIA));
  let broken = $state([]);
</script>

{#snippet marked(text)}
  {#each highlight(text, words) as part, i (i)}
    {#if part.hit}<mark class="bg-moss/30 text-text">{part.text}</mark>{:else}{part.text}{/if}
  {/each}
{/snippet}

<article
  class="card rise {memory.source === 'keep' ? 'border-l-4 border-l-moss' : ''}"
  style="--rise-delay: {Math.min(index, MAX_STAGGER) * STAGGER_MS}ms"
>
  <div class="flex items-center gap-2 font-mono text-xs uppercase">
    <span class="border border-line px-1.5 py-0.5 text-moss">{SOURCES[memory.source]?.short}</span>
    <span class="text-mute">{KIND_NAMES[memory.kind] ?? memory.kind}</span>
    <time class="ml-auto text-right text-ember" datetime={new Date(memory.at).toISOString()}>
      {new Date(memory.at).toLocaleString(undefined, DATE_FORMAT)}
    </time>
  </div>

  {#if memory.replyTo}<p class="mt-2 text-xs text-mute">replying to @{memory.replyTo}</p>{/if}
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

  {#if media.length}
    <div class="mt-3 grid gap-1 {media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
      {#each media as item, i (i)}
        <div class="relative overflow-hidden border border-line bg-ink {broken.includes(i) ? '' : 'aspect-video'}">
          {#if broken.includes(i)}
            <!-- X no longer serves this file (the post or its media was deleted). -->
            <span class="label flex items-center justify-center gap-2 py-3">
              <ImageOff class="h-4 w-4 shrink-0" />{item.type === 'photo' ? 'Photo' : 'Video'} gone from X
            </span>
          {:else}
            <img
              class="h-full w-full object-cover"
              src={item.thumb}
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              onerror={() => (broken = [...broken, i])}
            />
            {#if item.type !== 'photo'}
              <span class="absolute inset-0 flex items-center justify-center">
                <Play class="h-8 w-8 fill-text text-text drop-shadow" />
                <span class="sr-only">Video</span>
              </span>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if memory.labels?.length || memory.likes || memory.reposts || (memory.url && CAN_OPEN_LINKS)}
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
      {#each memory.labels ?? [] as label (label)}
        <span class="label border border-line px-1.5 py-0.5">{label}</span>
      {/each}
      {#if memory.likes}
        <span class="flex items-center gap-1"><Heart class="h-4 w-4" />{memory.likes}</span>
      {/if}
      {#if memory.reposts}
        <span class="flex items-center gap-1"><Repeat2 class="h-4 w-4" />{memory.reposts}</span>
      {/if}
      {#if memory.url && CAN_OPEN_LINKS}
        <a class="ml-auto underline" href={memory.url} target="_blank" rel="noopener noreferrer">
          Open on {SOURCES[memory.source]?.short}
        </a>
      {/if}
    </div>
  {/if}
</article>
