<script>
	import { getContext } from "svelte";
	import { queryStore, gql } from "@urql/svelte";
	import { Heart, MessageCircle, Repeat2, Share, Bookmark } from "lucide-svelte";
	import { formatDistanceToNow } from "date-fns";

	const HomeTimelineQuery = gql`
		query GetHomeTimeline {
			homeTimeline(limit: 50, offset: 0) {
				edges {
					node {
						id
						content
						createdAt
						author {
							username
							displayName
							profileImage
						}
						likesCount
						repliesCount
						isLiked
					}
				}
			}
		}
	`;

	// We get the query store from urql context
	const posts = queryStore({
		client: getContext("urql"),
		query: HomeTimelineQuery,
		requestPolicy: "cache-and-network",
	});
</script>

<div class="space-y-4">
	{#if $posts.fetching && !$posts.data}
		<div class="flex justify-center p-8">
			<div
				class="w-8 h-8 border-4 border-accent-secondary border-t-transparent animate-spin"
			></div>
		</div>
	{:else if $posts.error}
		<div
			class="p-4 bg-accent-primary/10 border border-accent-primary text-accent-primary font-mono text-sm uppercase"
		>
			<p>> ERROR_LOADING_FEED: {$posts.error.message}</p>
		</div>
	{:else if $posts.data}
		{#each $posts.data.homeTimeline.edges as edge}
			<article class="sharp-card p-4 group">
				<div class="flex space-x-3">
					<!-- Avatar (Sharp Square) -->
					<div
						class="w-12 h-12 border-2 border-base-border group-hover:border-accent-secondary transition-colors flex-shrink-0 relative overflow-hidden"
					>
						<div
							class="absolute inset-0 bg-accent-secondary/20 mix-blend-overlay z-10 group-hover:opacity-0 transition-opacity"
						></div>
						<img
							src={edge.node.author.profileImage}
							alt={edge.node.author.username}
							class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-75"
						/>
					</div>

					<div class="flex-1 min-w-0">
						<!-- Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center space-x-2 truncate">
								<span class="font-bold text-accent-secondary truncate"
									>{edge.node.author.displayName}</span
								>
								<span class="text-text-muted font-mono text-sm truncate"
									>@{edge.node.author.username}</span
								>
								<span class="text-text-muted text-sm">·</span>
								<span
									class="text-accent-primary font-mono text-xs whitespace-nowrap uppercase"
								>
									{formatDistanceToNow(new Date(edge.node.createdAt), {
										addSuffix: true,
									})}
								</span>
							</div>
						</div>

						<!-- Content -->
						<p
							class="mt-2 text-text-main text-[15px] leading-relaxed break-words whitespace-pre-wrap font-sans"
						>
							{edge.node.content}
						</p>

						<!-- Actions -->
						<div class="flex items-center justify-between mt-4 text-text-muted pr-8">
							<button
								class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75 group/btn"
							>
								<div class="group-hover/btn:bg-accent-secondary/10 p-1">
									<MessageCircle size={18} strokeWidth={1.5} />
								</div>
								<span class="font-mono text-xs">{edge.node.repliesCount}</span>
							</button>

							<button
								class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75 group/btn"
							>
								<div class="group-hover/btn:bg-accent-secondary/10 p-1">
									<Repeat2 size={18} strokeWidth={1.5} />
								</div>
							</button>

							<button
								class="flex items-center space-x-2 hover:text-accent-primary transition-colors duration-75 group/btn"
							>
								<div class="group-hover/btn:bg-accent-primary/10 p-1">
									<Heart
										size={18}
										strokeWidth={1.5}
										class={edge.node.isLiked
											? "fill-accent-primary text-accent-primary"
											: ""}
									/>
								</div>
								<span class="font-mono text-xs">{edge.node.likesCount}</span>
							</button>

							<div class="flex items-center space-x-2">
								<button
									class="p-1 hover:bg-accent-secondary/10 hover:text-accent-secondary transition-colors duration-75"
								>
									<Bookmark size={18} strokeWidth={1.5} />
								</button>
								<button
									class="p-1 hover:bg-accent-secondary/10 hover:text-accent-secondary transition-colors duration-75"
								>
									<Share size={18} strokeWidth={1.5} />
								</button>
							</div>
						</div>
					</div>
				</div>
			</article>
		{/each}
	{/if}
</div>
