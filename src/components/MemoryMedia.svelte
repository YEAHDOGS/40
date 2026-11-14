<script>
  // A memory's photos and videos: the copies inside your X archive when it is open (unpacked only when they
  // scroll into view, videos only when played), otherwise X's online copies, which may be gone.
  import ImageOff from '@lucide/svelte/icons/image-off';
  import Play from '@lucide/svelte/icons/play';
  import { archives, isVideo, mediaUrl, releaseMedia } from '#lib/archive.svelte.js';

  const MAX_MEDIA = 4;
  // Start unpacking a photo this far before it scrolls into view.
  const PRELOAD_MARGIN = '400px';

  /** @type {{ memory: any }} */
  let { memory } = $props();

  const local = $derived(
    (memory.files ?? []).filter((f) => archives.open[f.archive]).slice(0, MAX_MEDIA)
  );
  const online = $derived((memory.media ?? []).filter((m) => m.thumb).slice(0, MAX_MEDIA));
  const count = $derived(local.length || online.length);

  let urls = $state({});
  let playing = $state([]);
  let broken = $state([]);

  /** Unpacks a photo once it nears the screen. @param {any} entry */
  const whenVisible = (entry) => (node) => {
    const observer = new IntersectionObserver(
      async ([seen]) => {
        if (!seen.isIntersecting) return;
        observer.disconnect();
        urls[entry.name] = await mediaUrl(entry).catch(() => null);
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
  };

  async function play(entry) {
    playing = [...playing, entry.name];
    urls[entry.name] = await mediaUrl(entry).catch(() => null);
  }

  $effect(() => {
    const entries = local;
    return () => entries.forEach(releaseMedia);
  });
</script>

{#if count}
  <div class="mt-3 grid gap-1 {count > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
    {#if local.length}
      {#each local as entry (entry.name)}
        <div class="relative aspect-video overflow-hidden border border-line bg-ink">
          {#if !isVideo(entry)}
            {#if urls[entry.name]}
              <img class="h-full w-full object-cover" src={urls[entry.name]} alt="" decoding="async" />
            {:else}
              <span class="block h-full w-full animate-pulse bg-raise" {@attach whenVisible(entry)}></span>
            {/if}
          {:else if playing.includes(entry.name) && urls[entry.name]}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="h-full w-full bg-ink object-contain" src={urls[entry.name]} controls autoplay playsinline></video>
          {:else}
            <button
              class="flex h-full w-full items-center justify-center bg-cover bg-center"
              style={online[0] ? `background-image: url('${online[0].thumb}')` : ''}
              aria-label="Play video"
              onclick={() => play(entry)}
            >
              <Play class="h-10 w-10 fill-text text-text drop-shadow {playing.includes(entry.name) ? 'animate-pulse' : ''}" />
            </button>
          {/if}
        </div>
      {/each}
    {:else}
      {#each online as item, i (i)}
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
                <span class="sr-only">Video (open the archive to play it)</span>
              </span>
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/if}
