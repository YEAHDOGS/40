<script>
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.js';
	import { VISIBILITY_COPY, app, signOut } from '#lib/app.svelte.js';
	import HabitForm from '#lib/components/HabitForm.svelte';
	import REGIONS from '#lib/regions.json';

	const MAX_NAME = 30;

	let error = $state('');
	let name = $state(app.user.name);

	async function setName(event) {
		event.preventDefault();
		error = '';
		try {
			app.user.name = (await api('/api/me', { method: 'PUT', json: { name } })).name;
		} catch (err) {
			error = err.message;
		}
	}

	async function setRegion(event) {
		error = '';
		try {
			const res = await api('/api/me', { method: 'PUT', json: { region: event.target.value } });
			app.region = res.region;
		} catch (err) {
			error = err.message;
		}
	}

	async function setVisibility(habit, visibility) {
		error = '';
		try {
			await api(`/api/habits/${habit.id}`, { method: 'PUT', json: { visibility } });
			habit.visibility = visibility;
		} catch (err) {
			error = err.message;
		}
	}

	async function remove(habit) {
		if (!confirm(`Delete "${habit.name}" and its whole history? This cannot be undone.`)) return;
		error = '';
		try {
			await api(`/api/habits/${habit.id}`, { method: 'DELETE' });
			app.habits = app.habits.filter((h) => h.id !== habit.id);
		} catch (err) {
			error = err.message;
		}
	}
</script>

<section class="card mt-2">
	<form class="flex gap-2" onsubmit={setName}>
		<input
			class="field font-bold"
			bind:value={name}
			maxlength={MAX_NAME}
			aria-label="The name people see"
			required
		/>
		<button class="btn-quiet" disabled={name.trim() === app.user.name || !name.trim()}>Save</button>
	</form>
	<p class="mt-1 text-xs text-mute">The name people see. It does not have to be yours.</p>
	<p class="mt-3 text-sm text-mute">{app.user.email} (never shown to anyone)</p>
	<a class="mt-2 inline-block text-sm underline" href="{resolve('/person')}?id={app.user.id}">
		View your page
	</a>

	<label class="mt-4 block text-sm text-mute">
		State, for local comparisons (optional)
		<select class="field mt-1" value={app.region} onchange={setRegion}>
			<option value="">Not set</option>
			{#each REGIONS as code (code)}
				<option value="US-{code}">{code}</option>
			{/each}
		</select>
	</label>
</section>

{#if error}<p class="mt-3 text-sm text-ember" role="alert">{error}</p>{/if}

<section class="card mt-3">
	<h2 class="font-bold">What you track</h2>
	<p class="mb-3 text-sm text-mute">You decide who sees each one. Change it any time.</p>
	<div class="flex flex-col gap-3">
		{#each app.habits as habit (habit.id)}
			<div class="rounded-xl border border-line p-3">
				<div class="flex items-baseline justify-between gap-2">
					<span class="font-semibold">{habit.name}</span>
					<span class="text-xs {habit.kind === 'quit' ? 'text-ember' : 'text-moss'}"
						>{habit.kind}</span
					>
				</div>
				<div class="mt-2 flex gap-2">
					<select
						class="field py-1.5 text-sm"
						value={habit.visibility}
						aria-label="Who can see {habit.name}"
						onchange={(event) => setVisibility(habit, event.target.value)}
					>
						{#each Object.entries(VISIBILITY_COPY) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
					<button class="btn-quiet py-1.5 text-sm" onclick={() => remove(habit)}>Delete</button>
				</div>
			</div>
		{:else}
			<p class="text-sm text-mute">Nothing yet.</p>
		{/each}
	</div>
</section>

<section class="card mt-3">
	<h2 class="mb-3 font-bold">Track something new</h2>
	<HabitForm />
</section>

<button class="btn-quiet mt-3 w-full" onclick={signOut}>Sign out</button>
