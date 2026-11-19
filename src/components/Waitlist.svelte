<script>
  // The waitlist form shown while sign-in is closed (Auth.svelte). The request lives in #lib/waitlist.js.
  // The packaged apps cannot join from inside their webview (the API only answers the web origins), so
  // they point at the site instead.
  import { isTauri } from '@tauri-apps/api/core';
  import { hasJoined, joinWaitlist } from '#lib/waitlist.js';

  const MAX_EMAIL_LENGTH = 254;
  const SITE_URL = 'https://40.dogs.red';

  let email = $state('');
  let busy = $state(false);
  let joined = $state(hasJoined());
  let error = $state('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      await joinWaitlist(email);
      joined = true;
    } catch (failure) {
      error = failure.message;
    } finally {
      busy = false;
    }
  }
</script>

{#if joined}
  <p class="font-mono text-sm uppercase text-moss" role="status">&gt; You are on the list</p>
  <p class="text-sm text-mute">One email when 40 opens. Nothing else.</p>
{:else if isTauri()}
  <p class="text-sm text-mute">
    Join the waitlist at <a class="underline" href={SITE_URL} target="_blank" rel="noopener noreferrer">40.dogs.red</a>.
  </p>
{:else}
  <form class="flex flex-col gap-3" onsubmit={submit} aria-busy={busy}>
    <label class="text-sm text-mute">
      Email
      <input
        class="field mt-1"
        type="email"
        bind:value={email}
        maxlength={MAX_EMAIL_LENGTH}
        autocomplete="email"
        disabled={busy}
        required
      />
    </label>
    {#if error}<p class="text-sm text-ember" role="alert">{error}</p>{/if}
    <button class="btn" disabled={busy}>{busy ? 'Joining' : 'Join the waitlist'}</button>
    <p class="text-xs text-mute">One email when 40 opens. Nothing else.</p>
  </form>
{/if}
