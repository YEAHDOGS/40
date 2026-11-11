<script>
	import { isTauri } from '@tauri-apps/api/core';
	import { api } from '#lib/api.js';
	import { loadSession } from '#lib/app.svelte.js';
	import { authClient } from '#lib/auth.js';

	const MIN_PASSWORD = 8;

	let mode = $state('sign-up');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	// On the preview Worker this is the demo account's email, and the only way in is its password.
	let demoEmail = $state('');
	// Providers with credentials on the server. Web only: they refuse to run inside an app's webview.
	let providers = $state([]);

	const PROVIDER_NAMES = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

	api('/api/health')
		.then((health) => {
			demoEmail = health.demoEmail || '';
			providers = isTauri() ? [] : health.providers || [];
		})
		.catch(() => {});

	async function social(provider) {
		error = '';
		const result = await authClient.signIn.social({ provider, callbackURL: location.origin });
		if (result?.error) error = result.error.message || 'Something went wrong';
	}

	async function submit(event) {
		event.preventDefault();
		error = '';
		busy = true;
		const result = demoEmail
			? await authClient.signIn.email({ email: demoEmail, password })
			: mode === 'sign-up'
				? await authClient.signUp.email({ name: name.trim() || 'anonymous', email, password })
				: await authClient.signIn.email({ email, password });
		busy = false;
		if (result.error)
			error = demoEmail ? 'Wrong password' : result.error.message || 'Something went wrong';
		else await loadSession();
	}
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
	<div>
		<h1 class="text-7xl font-black tracking-tighter text-ember">40</h1>
		<p class="mt-3 text-lg">Track any habit. Share what you choose.</p>
		<p class="mt-1 text-mute">
			Your records are yours and private by default. Everything posted in public is deleted every 40
			days.
		</p>
	</div>

	{#if demoEmail}
		<form class="card flex flex-col gap-3" onsubmit={submit}>
			<p class="text-sm text-mute">This is the preview. Everything in it is dummy data.</p>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="field"
				type="password"
				bind:value={password}
				placeholder="Preview password"
				aria-label="Preview password"
				autocomplete="current-password"
				autofocus
				required
			/>
			{#if error}<p class="text-sm text-ember" role="alert">{error}</p>{/if}
			<button class="btn" disabled={busy}>Open the demo</button>
		</form>
	{:else}
		{#if providers.length}
			<div class="flex flex-col gap-2">
				{#each providers as provider (provider)}
					<button type="button" class="btn-quiet" onclick={() => social(provider)}>
						Continue with {PROVIDER_NAMES[provider]}
					</button>
				{/each}
				<p class="text-center text-xs text-mute">
					Your real name and photo are never copied over. You pick the name people see.
				</p>
			</div>
		{/if}
		<form class="card flex flex-col gap-3" onsubmit={submit}>
			{#if mode === 'sign-up'}
				<label class="text-sm text-mute">
					Name others see (no real name needed)
					<input
						class="field mt-1"
						bind:value={name}
						maxlength="30"
						autocomplete="nickname"
						required
					/>
				</label>
			{/if}
			<label class="text-sm text-mute">
				Email
				<input class="field mt-1" type="email" bind:value={email} autocomplete="email" required />
			</label>
			<label class="text-sm text-mute">
				Password
				<input
					class="field mt-1"
					type="password"
					bind:value={password}
					minlength={MIN_PASSWORD}
					autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
					required
				/>
			</label>
			{#if error}<p class="text-sm text-ember" role="alert">{error}</p>{/if}
			<button class="btn" disabled={busy}
				>{mode === 'sign-up' ? 'Create account' : 'Sign in'}</button
			>
			<button
				type="button"
				class="text-sm text-mute underline"
				onclick={() => (mode = mode === 'sign-up' ? 'sign-in' : 'sign-up')}
			>
				{mode === 'sign-up' ? 'I already have an account' : 'Create an account'}
			</button>
		</form>
	{/if}
</main>
