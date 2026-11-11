<script>
  import { api } from '#lib/api.js';
  import { today } from '#lib/dates.js';

  /** @type {{ id: string }} the person to show */
  let { id } = $props();

  let data = $state(null);
  let error = $state('');

  async function load() {
    try {
      data = await api(`/api/people/${id}?today=${today()}`);
    } catch (err) {
      error = err.message;
    }
  }

  // Following can unlock friends-only habits, so reload the page data afterwards.
  async function toggleFollow() {
    try {
      await api(`/api/people/${id}/follow`, { method: data.following ? 'DELETE' : 'POST' });
      await load();
    } catch (err) {
      error = err.message;
    }
  }

  load();
</script>

{#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

{#if data}
  <section class="card mt-2 flex items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-bold">{data.person.name}</h1>
      {#if data.bio}<p class="mt-1 text-sm break-words">{data.bio}</p>{/if}
      <p class="text-xs text-mute">
        {#if data.isSelf}
          You see everything here. Others only see what you share.
        {:else if data.following && data.followsYou}
          You are friends
        {:else if data.followsYou}
          Follows you
        {:else}
          Follow each other to see friends-only habits
        {/if}
      </p>
    </div>
    {#if !data.isSelf}
      <button class={data.following ? 'btn-quiet' : 'btn'} onclick={toggleFollow}>
        {data.following ? 'Following' : 'Follow'}
      </button>
    {/if}
  </section>

  <div class="mt-3 flex flex-col gap-3">
    {#each data.habits as habit (habit.id)}
      <article class="card">
        <div class="flex items-baseline justify-between">
          <h2 class="font-bold">{habit.name}</h2>
          <span class="text-xs text-mute">{habit.visibility}</span>
        </div>
        <p class="mt-1 text-2xl font-black {habit.streak ? 'text-moss' : 'text-mute'}">
          {habit.streak}
          <span class="text-sm font-normal text-mute">
            day{habit.streak === 1 ? '' : 's'}
            {habit.kind === 'quit' ? 'clean' : 'in a row'}
          </span>
        </p>
        <p class="mt-1 text-sm text-mute">
          {habit.recentDone} of {habit.recentTracked} tracked days in the last {data.windowDays}
        </p>
      </article>
    {:else}
      <p class="card text-mute">Nothing shared.</p>
    {/each}
  </div>
{/if}
