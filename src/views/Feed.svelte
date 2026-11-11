<script>
  import { api } from '#lib/api.js';
  import PostCard from '../components/PostCard.svelte';
  import { countdown } from '#lib/dates.js';

  const MAX_BODY = 500;

  let posts = $state(null);
  let cycle = $state(null);
  let body = $state('');
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try {
      ({ posts, cycle } = await api('/api/feed'));
    } catch (err) {
      error = err.message;
    }
  }

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const { post } = await api('/api/posts', { method: 'POST', json: { body } });
      posts = [post, ...(posts || [])];
      body = '';
    } catch (err) {
      error = err.message;
    }
    busy = false;
  }

  async function remove(post) {
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      posts = posts.filter((p) => p.id !== post.id);
    } catch (err) {
      error = err.message;
    }
  }

  load();
</script>

<form class="card mt-2 flex flex-col gap-2" onsubmit={submit}>
  <textarea
    class="field resize-none"
    rows="3"
    maxlength={MAX_BODY}
    bind:value={body}
    placeholder="Say something. It will be gone in {cycle ? countdown(cycle.endsAt) : '40 days'}."
    aria-label="New post"
    required></textarea>
  <div class="flex items-center justify-between">
    <span class="text-xs text-mute">{body.length}/{MAX_BODY}</span>
    <button class="btn" disabled={busy || !body.trim()}>Post</button>
  </div>
</form>

{#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

<div class="mt-3 flex flex-col gap-3">
  {#if !posts}
    <p class="text-mute">Loading…</p>
  {:else}
    {#each posts as post (post.id)}
      <PostCard {post} ondelete={remove} />
    {:else}
      <p class="card text-mute">Nothing here yet this cycle. Say the first thing.</p>
    {/each}
  {/if}
</div>
