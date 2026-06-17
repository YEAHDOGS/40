<script>
	import { getContext, onMount } from "svelte";
	import { gql } from "@urql/svelte";
	import { Heart, MessageCircle, Repeat2, Share, Bookmark, ArrowLeft, PlayCircle } from "lucide-svelte";
	import { formatDistanceToNow } from "date-fns";

	let { postId, onBack } = $props();
	const client = getContext("urql");

	let post = $state(null);
	let replies = $state([]);
	let fetching = $state(true);
	let error = $state(null);
	let replyContent = $state("");
	let isReplying = $state(false);

	const PostQuery = gql`
		query GetPost($id: ID!) {
			post(id: $id) {
				id
				content
				postType
				createdAt
				likesCount
				repliesCount
				retweetsCount
				isLiked
				isRetweeted
				author {
					id
					username
					displayName
					profileImage
				}
				media {
					url
					mediaType
				}
				replies {
					id
					content
					createdAt
					likesCount
					repliesCount
					isLiked
					author {
						username
						displayName
						profileImage
					}
				}
			}
		}
	`;

	const CREATE_POST_MUTATION = gql`
		mutation CreatePost($input: CreatePostInput!) {
			createPost(input: $input) {
				id
			}
		}
	`;

	async function loadPostData() {
		fetching = true;
		error = null;
		try {
			const result = await client.query(PostQuery, { id: postId }, { requestPolicy: "network-only" }).toPromise();
			if (result.error) {
				error = result.error.message;
			} else {
				post = result.data?.post || null;
				replies = post?.replies || [];
			}
		} catch (err) {
			error = err.message;
		} finally {
			fetching = false;
		}
	}

	onMount(() => {
		loadPostData();
	});

	async function handleLike(id, isReply = false) {
		try {
			await client.mutation(gql`mutation { likePost(postId: "${id}") { id } }`).toPromise();
			if (!isReply && post) {
				post.isLiked = !post.isLiked;
				post.likesCount += post.isLiked ? 1 : -1;
			} else {
				// Reload to update reply counts
				loadPostData();
			}
		} catch (err) {
			console.error(err);
		}
	}

	async function handleRepost(id) {
		try {
			await client.mutation(gql`mutation { retweetPost(postId: "${id}") { id } }`).toPromise();
			if (post) {
				post.isRetweeted = !post.isRetweeted;
				post.retweetsCount += post.isRetweeted ? 1 : -1;
			}
		} catch (err) {
			console.error(err);
		}
	}

	async function submitComment() {
		if (!replyContent.trim()) return;
		isReplying = true;
		try {
			const result = await client.mutation(CREATE_POST_MUTATION, {
				input: {
					content: replyContent,
					replyToId: postId
				}
			}).toPromise();
			
			if (result.error) {
				alert("Error: " + result.error.message);
			} else {
				replyContent = "";
				// Refetch comments dynamically
				await loadPostData();
			}
		} catch (err) {
			console.error(err);
		} finally {
			isReplying = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Back Navigation -->
	<button
		onclick={onBack}
		class="inline-flex items-center space-x-2 text-text-muted hover:text-accent-secondary font-mono text-xs uppercase tracking-widest transition-colors"
	>
		<ArrowLeft size={16} />
		<span>&lt;&lt; BACK_TO_FEED</span>
	</button>

	{#if fetching && !post}
		<div class="flex justify-center p-12">
			<div class="w-10 h-10 border-4 border-accent-secondary border-t-transparent animate-spin"></div>
		</div>
	{:else if error}
		<div class="p-4 bg-accent-primary/10 border border-accent-primary text-accent-primary font-mono text-sm uppercase">
			<p>&gt; ERROR_FETCHING_POST: {error}</p>
		</div>
	{:else if post}
		<!-- Main Post -->
		<article class="sharp-card p-6 relative z-10 before:absolute before:inset-0 before:bg-accent-secondary/5 before:-z-10 bg-base-darker/30">
			<div class="flex items-start space-x-4">
				<!-- Author Avatar -->
				<div class="w-14 h-14 border-2 border-accent-secondary flex-shrink-0 relative overflow-hidden">
					<img
						src={post.author.profileImage}
						alt="Avatar"
						class="w-full h-full object-cover grayscale"
					/>
				</div>

				<!-- Header Metadata -->
				<div class="flex-1 min-w-0">
					<div class="flex flex-col">
						<span class="font-bold text-lg text-accent-secondary">{post.author.displayName}</span>
						<span class="text-text-muted font-mono text-sm">@{post.author.username}</span>
					</div>
				</div>
				
				<!-- Timestamp -->
				<span class="text-accent-primary font-mono text-xs uppercase">
					{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
				</span>
			</div>

			<!-- Main Body -->
			<div class="mt-6">
				<p class="text-text-main text-lg leading-relaxed break-words whitespace-pre-wrap font-sans">
					{post.content}
				</p>
			</div>

			<!-- Media Attachments -->
			{#if post.media && post.media.length > 0}
				<div class="mt-4 grid grid-cols-1 gap-2">
					{#each post.media as media}
						{#if media.mediaType === "IMAGE"}
							<img src={media.url} alt="Post media" class="w-full h-80 object-cover border border-base-border rounded-sm grayscale" />
						{:else}
							<div class="w-full h-80 bg-base-darker border border-base-border flex items-center justify-center text-accent-secondary relative group cursor-pointer">
								<PlayCircle size={64} class="group-hover:scale-110 transition-transform" />
							</div>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Action Counters -->
			<div class="mt-6 flex items-center space-x-6 text-text-muted font-mono text-xs uppercase border-y border-base-border/30 py-3">
				<span><strong>{post.likesCount}</strong> LIKES</span>
				<span><strong>{post.repliesCount}</strong> REPLIES</span>
				<span><strong>{post.retweetsCount}</strong> REPOSTS</span>
			</div>

			<!-- Large Action Buttons -->
			<div class="flex items-center justify-between mt-4 text-text-muted px-4">
				<button
					onclick={() => handleLike(post.id)}
					class="flex items-center space-x-2 hover:text-accent-primary transition-colors duration-75 group/btn"
				>
					<div class="group-hover/btn:bg-accent-primary/10 p-1">
						<Heart
							size={20}
							strokeWidth={1.5}
							class={post.isLiked ? "fill-accent-primary text-accent-primary" : ""}
						/>
					</div>
					<span class="font-mono text-xs uppercase {post.isLiked ? 'text-accent-primary font-bold' : ''}">Like</span>
				</button>

				<button
					onclick={() => handleRepost(post.id)}
					class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75 group/btn"
				>
					<div class="group-hover/btn:bg-accent-secondary/10 p-1">
						<Repeat2 size={20} strokeWidth={1.5} class={post.isRetweeted ? "text-accent-secondary" : ""} />
					</div>
					<span class="font-mono text-xs uppercase {post.isRetweeted ? 'text-accent-secondary font-bold' : ''}">Repost</span>
				</button>

				<button class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75">
					<Bookmark size={20} strokeWidth={1.5} />
					<span class="font-mono text-xs uppercase">Save</span>
				</button>

				<button class="flex items-center space-x-2 hover:text-accent-secondary transition-colors duration-75">
					<Share size={20} strokeWidth={1.5} />
					<span class="font-mono text-xs uppercase">Share</span>
				</button>
			</div>
		</article>

		<!-- Comment Box Form -->
		<div class="sharp-card p-6 bg-base-darker/20">
			<h3 class="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">&gt; COMMS_TRANSMISSION_INPUT</h3>
			<textarea
				bind:value={replyContent}
				placeholder="Write a comment..."
				class="input-sharp min-h-[100px] resize-none text-sm font-sans"
				disabled={isReplying}
			></textarea>
			<div class="flex justify-between items-center mt-3">
				<span class="text-xs font-mono text-text-muted uppercase">Length: {replyContent.length} chars</span>
				<button
					onclick={submitComment}
					disabled={!replyContent.trim() || isReplying}
					class="button-primary py-2 px-6 font-mono uppercase tracking-wider text-xs"
				>
					{isReplying ? "TRANSMITTING..." : "POST_COMMENT"}
				</button>
			</div>
		</div>

		<!-- Comments Feed Header -->
		<div class="border-b border-base-border pb-2">
			<h2 class="text-sm font-mono text-accent-secondary uppercase tracking-widest">&gt;&gt; COMMENTS_THREAD ({replies.length})</h2>
		</div>

		<!-- Comments List -->
		{#if replies.length === 0}
			<div class="text-center py-8 border border-dashed border-base-border text-text-muted font-mono text-sm uppercase">
				<p>No comments received yet. Be the first to express opinion.</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each replies as reply}
					<div class="sharp-card p-4 ml-4 md:ml-8 border-l-2 border-accent-secondary bg-base-darker/10 group">
						<div class="flex items-start space-x-3">
							<!-- Reply Author Avatar -->
							<div class="w-10 h-10 border border-base-border flex-shrink-0 overflow-hidden">
								<img
									src={reply.author.profileImage}
									alt="Avatar"
									class="w-full h-full object-cover grayscale"
								/>
							</div>

							<div class="flex-1 min-w-0">
								<!-- Metadata -->
								<div class="flex items-center justify-between truncate">
									<div class="flex items-center space-x-2 truncate">
										<span class="font-bold text-accent-secondary text-sm truncate">{reply.author.displayName}</span>
										<span class="text-text-muted font-mono text-xs truncate">@{reply.author.username}</span>
										<span class="text-text-muted text-xs">·</span>
										<span class="text-accent-primary font-mono text-[10px] uppercase whitespace-nowrap">
											{formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
										</span>
									</div>
								</div>

								<!-- Comment Content -->
								<p class="mt-2 text-text-main text-sm leading-relaxed break-words whitespace-pre-wrap font-sans">
									{reply.content}
								</p>

								<!-- Comment Actions -->
								<div class="flex items-center space-x-4 mt-3 text-text-muted">
									<button
										onclick={() => handleLike(reply.id, true)}
										class="flex items-center space-x-1.5 hover:text-accent-primary transition-colors text-xs"
									>
										<Heart
											size={14}
											strokeWidth={1.5}
											class={reply.isLiked ? "fill-accent-primary text-accent-primary" : ""}
										/>
										<span class="font-mono text-xs">{reply.likesCount}</span>
									</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
