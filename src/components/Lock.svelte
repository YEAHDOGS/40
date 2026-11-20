<script>
  // The first screen while 40 is a work in progress: coming soon, and one way forward, the site password
  // (api/lib/gate.js). Sign-in, sign-up and the demo are all behind it.
  import { unlock } from '#lib/app.svelte.js';

  const MAX_PASSWORD = 200;

  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      await unlock(password);
    } catch (err) {
      error = err.message || 'Cannot reach 40 right now.';
      password = '';
    }
    busy = false;
  }
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
  <div class="text-center">
    <div class="logo-box mx-auto mb-6 h-16 w-16 text-3xl">40</div>
    <h1 class="text-glitch text-3xl">Forty</h1>
    <p class="label mt-2 animate-pulse text-ember">&gt; Work in progress</p>
    <p class="mt-6">Coming soon.</p>
    <p class="mt-1 text-sm text-mute">
      Track any habit. Share what you choose. Everything posted in public is deleted every 40 days.
    </p>
  </div>

  <form class="card flex flex-col gap-3" onsubmit={submit} aria-busy={busy}>
    <input
      class="field"
      type="password"
      bind:value={password}
      maxlength={MAX_PASSWORD}
      placeholder="Password"
      aria-label="Password"
      aria-describedby="lock-error"
      autocomplete="current-password"
      disabled={busy}
      required
    />
    <!-- The line is always there, so a wrong password does not move the button. -->
    <p id="lock-error" class="min-h-5 text-sm text-ember" role="alert">{error}</p>
    <button class="btn" disabled={busy}>Enter password</button>
  </form>
</main>
