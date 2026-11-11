<script>
	import { resolve } from '$app/paths';
	import { app } from '#lib/app.svelte.js';
	import { ago } from '#lib/dates.js';

	// post: { id, userId, name, kind, body, createdAt, comments }. ondelete is called for your own posts.
	let { post, linked = true, ondelete } = $props();
</script>

<article class="card {post.kind === 'record' ? 'border-l-4 border-l-ember' : ''}">
	<div class="flex items-baseline justify-between gap-2 text-sm">
		<a class="font-semibold" href="{resolve('/person')}?id={post.userId}">{post.name}</a>
		<span class="text-xs text-mute">{ago(post.createdAt)}</span>
	</div>
	<p
		class="mt-2 break-words whitespace-pre-wrap {post.kind === 'record' ? 'text-lg font-bold' : ''}"
	>
		{post.body}
	</p>
	<div class="mt-3 flex items-center justify-between text-sm text-mute">
		{#if linked}
			<a href="{resolve('/post')}?id={post.id}">
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
