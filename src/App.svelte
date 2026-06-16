<script>
	import { setContext, onMount } from "svelte";
	import { Client, cacheExchange, fetchExchange } from "@urql/svelte";

	import Layout from "./components/Layout.svelte";
	import CreatePost from "./components/CreatePost.svelte";
	import Feed from "./components/Feed.svelte";
	import Settings from "./components/Settings.svelte";
	import { initTheme } from "./lib/theme.js";

	// Initialize the urql GraphQL client
	// Pointing to our local Vite-plugin Yoga server
	const client = new Client({
		url: "/graphql",
		exchanges: [cacheExchange, fetchExchange],
	});

	// Set the client in Svelte context so all child components can access it
	setContext("urql", client);

	let currentView = $state("home");

	onMount(() => {
		initTheme();
	});
</script>

<Layout bind:currentView>
	<div class="max-w-2xl mx-auto">
		{#if currentView === "home"}
			<!-- Post Composer -->
			<CreatePost />

			<!-- Timeline Filter/Tabs -->
			<div class="flex items-center space-x-6 mb-6 px-2 border-b border-base-border">
				<button
					class="pb-3 text-accent-secondary font-bold font-mono border-b-2 border-accent-secondary transition-colors uppercase tracking-widest text-sm"
					>> FOR_YOU</button
				>
				<button
					class="pb-3 text-text-muted font-mono hover:text-text-main transition-colors uppercase tracking-widest text-sm"
					>FOLLOWING</button
				>
				<button
					class="pb-3 text-text-muted font-mono hover:text-text-main transition-colors uppercase tracking-widest text-sm hidden sm:block"
					>RANDOM_NODE</button
				>
			</div>

			<!-- Timeline Feed -->
			<Feed />
		{:else if currentView === "config"}
			<Settings />
		{/if}
	</div>
</Layout>
