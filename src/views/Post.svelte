<script>
  import { api } from '#lib/api.js';
  import { go, href } from '#lib/router.svelte.js';
  import { app } from '#lib/app.svelte.js';
  import PostCard from '../components/PostCard.svelte';
  import { ago } from '#lib/dates.js';

  const MAX_BODY = 500;
  /** @type {{ id: string }} the post to show */
  let { id } = $props();

  let post = $state(null);
  let comments = $state([]);
  let body = $state('');
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try {
      ({ post, comments } = await api(`/api/posts/${id}`));
    } catch (err) {
      error = err.message;
    }
  }

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const { comment } = await api(`/api/posts/${id}/comments`, {
        method: 'POST',
        json: { body }
      });
      comments.push(comment);
      body = '';
    } catch (err) {
      error = err.message;
    }
    busy = false;
  }

  async function removePost() {
    try {
      await api(`/api/posts/${id}`, { method: 'DELETE' });
      go('feed');
    } catch (err) {
      error = err.message;
    }
  }

  async function removeComment(comment) {
    try {
      await api(`/api/comments/${comment.id}`, { method: 'DELETE' });
      comments = comments.filter((c) => c.id !== comment.id);
    } catch (err) {
      error = err.message;
    }
  }

  load();
</script>

<a class="mt-2 inline-block text-sm text-mute" href={href('feed')}>‹ Feed</a>

{#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

{#if post}
  <div class="mt-2"><PostCard {post} linked={false} ondelete={removePost} /></div>

  <div class="mt-3 flex flex-col gap-2">
    {#each comments as comment (comment.id)}
      <div class=" border border-line px-4 py-3">
        <div class="flex items-baseline justify-between text-sm">
          <a class="font-semibold" href={href('person', comment.userId)}>{comment.name}</a
          >
          <span class="text-xs text-mute">
            {ago(comment.createdAt)}
            {#if comment.userId === app.user.id}
              · <button class="underline" onclick={() => removeComment(comment)}>delete</button>
            {/if}
          </span>
        </div>
        <p class="mt-1 break-words whitespace-pre-wrap">{comment.body}</p>
      </div>
    {/each}
  </div>

  <form class="mt-3 flex gap-2" onsubmit={submit}>
    <input
      class="field"
      bind:value={body}
      maxlength={MAX_BODY}
      placeholder="Add a comment"
      aria-label="Add a comment"
      required
    />
    <button class="btn" disabled={busy || !body.trim()}>Send</button>
  </form>
{/if}
