<script>
	import { getContext } from "svelte";
	import { queryStore, gql, mutationStore } from "@urql/svelte";
	import { Heart, MessageCircle, Repeat2, Share, Bookmark, Image as ImageIcon, PlayCircle } from "lucide-svelte";
	import { formatDistanceToNow } from "date-fns";

	const HomeTimelineQuery = gql`
		query GetHomeTimeline {
			homeTimeline(limit: 50, offset: 0) {
				edges {
					node {
						id
						content
						postType
						createdAt
						author {
							username
							displayName
							profileImage
						}
						media {
							url
							mediaType
						}
						repostOf {
							content
							author {
								displayName
								username
							}
							createdAt
						}
						likesCount
						repliesCount
						retweetsCount
						quotesCount
						isLiked
						isRetweeted
					}
				}
			}
		}
	`;

	const posts = queryStore({
		client: getContext("urql"),
		query: HomeTimelineQuery,
		requestPolicy: "cache-and-network",
	});

	const client = getContext("urql");

	function handleLike(postId) {
		client.mutation(gql`mutation { likePost(postId: "${postId}") { id } }`).toPromise();
	}

	function handleRepost(postId) {
		client.mutation(gql`mutation { retweetPost(postId: "${postId}") { id } }`).toPromise();
	}

	const CREATE_POST_MUTATION = gql`
		mutation CreatePost($input: CreatePostInput!) {
			createPost(input: $input) {
				id
			}
		}
	`;

	let replyingTo = $state(null);
	let replyContent = $state("");
	let isReplying = $state(false);

	async function submitReply(postId) {
		if (!replyContent.trim()) return;
		isReplying = true;
		await client.mutation(CREATE_POST_MUTATION, {
			input: {
				content: replyContent,
				replyToId: postId
			}
		}).toPromise();
		isReplying = false;
		replyingTo = null;
		replyContent = "";
	}
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
				{#if edge.node.postType === "REPOST" && edge.node.repostOf}
					<div class="flex items-center space-x-2 text-text-muted text-xs font-mono uppercase mb-3 ml-10">
						<Repeat2 size={14} />
						<span>{edge.node.author.displayName} reposted</span>
					</div>
				{/if}

				<div class="flex space-x-3">
					<!-- Avatar (Sharp Square) -->
					<div
						class="w-12 h-12 border-2 border-base-border group-hover:border-accent-secondary transition-colors flex-shrink-0 relative overflow-hidden"
					>
						<div
							class="absolute inset-0 bg-accent-secondary/20 mix-blend-overlay z-10 group-hover:opacity-0 transition-opacity"
						></div>
						<img
							src={edge.node.postType === "REPOST" ? edge.node.repostOf.author.profileImage : edge.node.author.profileImage}
							alt="Avatar"
							class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-75"
						/>
					</div>

					<div class="flex-1 min-w-0">
						<!-- Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center space-x-2 truncate">
								<span class="font-bold text-accent-secondary truncate"
									>
									{#if edge.node.postType === "REPOST"}
										{edge.node.repostOf.author.displayName}
									{:else}
										{edge.node.author.displayName}
									{/if}
									</span
								>
								<span class="text-text-muted font-mono text-sm truncate"
									>@{#if edge.node.postType === "REPOST"}{edge.node.repostOf.author.username}{:else}{edge.node.author.username}{/if}</span
								>
								<span class="text-text-muted text-sm">·</span>
								<span
									class="text-accent-primary font-mono text-xs whitespace-nowrap uppercase"
								>
									{formatDistanceToNow(new Date(edge.node.postType === "REPOST" ? edge.node.repostOf.createdAt : edge.node.createdAt), {
										addSuffix: true,
									})}
								</span>
							</div>
						</div>

						<!-- Content -->
						<p
							class="mt-2 text-text-main text-[15px] leading-relaxed break-words whitespace-pre-wrap font-sans"
						>
							{#if edge.node.postType === "REPOST"}
								{edge.node.repostOf.content}
							{:else}
								{edge.node.content}
							{/if}
						</p>

						<!-- Media -->
						{#if edge.node.media && edge.node.media.length > 0}
							<div class="mt-4 grid grid-cols-1 gap-2">
								{#each edge.node.media as media}
									{#if media.mediaType === "IMAGE"}
										<img src={media.url} alt="Post media" class="w-full h-64 object-cover border border-base-border rounded-sm grayscale hover:grayscale-0 transition-all cursor-pointer" />
									{:else}
										<div class="w-full h-64 bg-base-darker border border-base-border flex items-center justify-center text-accent-secondary relative group cursor-pointer">
											<PlayCircle size={48} class="group-hover:scale-110 transition-transform" />
										</div>
									{/if}
								{/each}
							</div>
						{/if}

						<!-- Actions -->
						<div class="flex items-center justify-between mt-4 text-text-muted pr-8">
							<button
								onclick={() => replyingTo = replyingTo === edge.node.id ? null : edge.node.id}
								class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75 group/btn {replyingTo === edge.node.id ? 'text-accent-secondary' : ''}"
							>
								<div class="group-hover/btn:bg-accent-secondary/10 p-1">
									<MessageCircle size={18} strokeWidth={1.5} />
								</div>
								<span class="font-mono text-xs">{edge.node.repliesCount}</span>
							</button>

							<button
								onclick={() => handleRepost(edge.node.id)}
								class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75 group/btn"
							>
								<div class="group-hover/btn:bg-accent-secondary/10 p-1">
									<Repeat2 size={18} strokeWidth={1.5} class={edge.node.isRetweeted ? "text-accent-secondary" : ""} />
								</div>
								<span class="font-mono text-xs {edge.node.isRetweeted ? "text-accent-secondary" : ""}">{edge.node.retweetsCount}</span>
							</button>

							<button
								onclick={() => handleLike(edge.node.id)}
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
								<span class="font-mono text-xs {edge.node.isLiked ? "text-accent-primary" : ""}">{edge.node.likesCount}</span>
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

						<!-- Inline Reply -->
						{#if replyingTo === edge.node.id}
							<div class="mt-4 pt-4 border-t border-base-border/50 flex space-x-3">
								<div class="flex-1">
									<textarea
										bind:value={replyContent}
										placeholder="> INPUT_REPLY..."
										class="input-sharp min-h-[60px] resize-none text-sm"
									></textarea>
									<div class="flex justify-end mt-2">
										<button 
											onclick={() => submitReply(edge.node.id)}
											disabled={!replyContent.trim() || isReplying}
											class="button-primary text-xs py-1 px-4"
										>
											{isReplying ? 'EXECUTING...' : 'REPLY'}
										</button>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	{/if}
</div>
