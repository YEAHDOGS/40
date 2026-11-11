<script>
  import { href } from '#lib/router.svelte.js';
  import { app } from '#lib/app.svelte.js';
  import { ago } from '#lib/dates.js';

  // post: { id, userId, name, kind, body, createdAt, comments }. ondelete is called for your own posts.
  let { post, linked = true, ondelete } = $props();
</script>

<article class="card {post.kind === 'record' ? 'border-l-4 border-l-ember' : ''}">
  <div class="flex items-center gap-3 text-sm">
    <!-- The square avatar from the original build: an initial, since nobody uploads a face here. -->
    <a
      href={href('person', post.userId)}
      class="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-line bg-moss/10 font-mono text-lg font-bold uppercase text-moss"
      aria-hidden="true"
      tabindex="-1">{post.name.slice(0, 1)}</a
    >
    <a class="min-w-0 flex-1 truncate font-bold text-moss" href={href('person', post.userId)}>{post.name}</a>
    <span class="font-mono text-xs uppercase text-ember">{ago(post.createdAt)}</span>
  </div>
  <p
    class="mt-2 break-words whitespace-pre-wrap {post.kind === 'record' ? 'text-lg font-bold' : ''}"
  >
    {post.body}
  </p>
  <div class="mt-3 flex items-center justify-between text-sm text-mute">
    {#if linked}
      <a href={href('post', post.id)}>
        {post.comments} comment{post.comments === 1 ? '' : 's'}
      </a>
    {:else}
      <span></span>
    {/if}
    {#if ondelete && post.userId === app.user.id}
      <button class="underline" onclick={() => ondelete(post)}>delete</button>
    {/if}
  </div>
</article>
