<script>
	import { getContext } from "svelte";
	import { queryStore, gql } from "@urql/svelte";

	const TrendsQuery = gql`
		query GetTrends {
			trends(limit: 5) {
				hashtag {
					tag
				}
				usageCount
				rank
			}
		}
	`;

	const trends = queryStore({
		client: getContext("urql"),
		query: TrendsQuery,
		requestPolicy: "cache-and-network",
	});
</script>

<div class="sharp-panel p-5">
	<h2 class="text-lg font-bold mb-4 font-mono text-accent-primary border-b border-base-border pb-2">
		> NETWORK_TRENDS
	</h2>
	
	<div class="space-y-4 mt-4">
		{#if $trends.fetching}
			<div class="animate-pulse flex space-x-4">
				<div class="flex-1 space-y-4 py-1">
					<div class="h-2 bg-base-border rounded w-3/4"></div>
					<div class="space-y-2">
						<div class="h-2 bg-base-border rounded"></div>
						<div class="h-2 bg-base-border rounded w-5/6"></div>
					</div>
				</div>
			</div>
		{:else if $trends.error}
			<p class="text-xs text-accent-primary font-mono">> ERR_FETCHING_TRENDS</p>
		{:else if $trends.data && $trends.data.trends.length > 0}
			{#each $trends.data.trends as trend, i}
				<div class="cursor-pointer group">
					<p class="text-xs text-text-muted font-mono">0{i + 1} // RANK {trend.rank}</p>
					<p class="font-bold text-text-main group-hover:text-accent-secondary transition-colors duration-75">
						#{trend.hashtag.tag}
					</p>
					<p class="text-xs text-text-muted font-mono">{trend.usageCount} packets</p>
				</div>
			{/each}
		{:else}
			<p class="text-xs text-text-muted font-mono">> NO_TRENDS_FOUND</p>
		{/if}
	</div>
</div>
