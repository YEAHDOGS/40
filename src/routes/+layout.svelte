<script>
	import './layout.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { app, loadSession } from '#lib/app.svelte.js';
	import favicon from '#lib/assets/icon.svg';
	import Auth from '#lib/components/Auth.svelte';
	import { countdown } from '#lib/dates.js';

	// [route, label, other routes that light up the same tab]
	const TABS = [
		['/', 'Track', []],
		['/stats', 'Stats', []],
		['/feed', 'Feed', ['/post', '/person']],
		['/you', 'You', []]
	];

	let { children } = $props();

	const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');

	loadSession();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !app.ready}
	<div class="flex min-h-dvh items-center justify-center text-6xl font-black text-ember">40</div>
{:else if app.down}
	<div class="mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center gap-4 p-6">
		<h1 class="text-6xl font-black text-ember">40</h1>
		<p role="alert">{app.down}</p>
		<button class="btn-quiet" onclick={loadSession}>Try again</button>
	</div>
{:else if !app.user}
	<Auth />
{:else}
	<div class="mx-auto flex min-h-dvh max-w-xl flex-col">
		<header class="flex items-baseline justify-between px-4 pt-4 pb-2">
			<a href={resolve('/')} class="text-3xl font-black tracking-tighter text-ember">40</a>
			{#if app.cycle}
				<p class="text-xs text-mute" title="Posts and comments are deleted when this reaches zero">
					public wipe in <span class="text-text">{countdown(app.cycle.endsAt)}</span>
				</p>
			{/if}
		</header>

		<main class="flex-1 px-4 pb-24">{@render children()}</main>

		<nav
			class="fixed inset-x-0 bottom-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
		>
			<div class="mx-auto grid max-w-xl grid-cols-4">
				{#each TABS as [route, label, also] (route)}
					{@const active = path === route || also.includes(path)}
					<a
						href={resolve(route)}
						class="py-4 text-center text-sm font-semibold {active ? 'text-ember' : 'text-mute'}"
						aria-current={active ? 'page' : undefined}
					>
						{label}
					</a>
				{/each}
			</div>
		</nav>
	</div>
{/if}
