<script>
	import { getContext } from "svelte";
	import { queryStore, gql } from "@urql/svelte";
	import { Heart, Repeat2, UserPlus, ShieldAlert, Sparkles } from "lucide-svelte";
	import { formatDistanceToNow } from "date-fns";

	const NotificationsQuery = gql`
		query GetNotifications {
			notifications(limit: 20, offset: 0) {
				edges {
					node {
						actor {
							username
							displayName
							profileImage
						}
					}
				}
				unreadCount
			}
		}
	`;

	const notifications = queryStore({
		client: getContext("urql"),
		query: NotificationsQuery,
		requestPolicy: "cache-and-network",
	});

	// Mocking notifications until backend resolvers are fully populated
	let mockNotifications = [
		{ id: 1, type: "LIKE", actor: { displayName: "Trinity", username: "trinity", profileImage: "https://api.dicebear.com/7.x/avataaars/svg?seed=trinity" }, post: { content: "Wake up, Neo..." }, createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), read: false },
		{ id: 2, type: "REPOST", actor: { displayName: "Morpheus", username: "morpheus", profileImage: "https://api.dicebear.com/7.x/avataaars/svg?seed=morpheus" }, post: { content: "The Matrix is everywhere." }, createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), read: true },
		{ id: 3, type: "FOLLOW", actor: { displayName: "Cypher", username: "cypher", profileImage: "https://api.dicebear.com/7.x/avataaars/svg?seed=cypher" }, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), read: true },
		{ id: 4, type: "SYSTEM", message: "Global wipe scheduled in T-minus 24:00:00", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), read: false }
	];
</script>

<div class="max-w-2xl mx-auto pb-20">
	<div class="flex items-center justify-between mb-6 pb-4 border-b border-base-border">
		<h1 class="text-2xl font-bold font-mono text-accent-secondary flex items-center">
			> ALERTS_LOG
		</h1>
		<button class="text-xs font-mono text-text-muted hover:text-accent-secondary transition-colors">
			[MARK_ALL_READ]
		</button>
	</div>

	<div class="space-y-4">
		{#each mockNotifications as notification}
			<div class="p-4 border-l-2 transition-colors duration-200 sharp-card flex space-x-4
				{notification.read ? 'border-base-border/30 opacity-70' : 'border-accent-secondary bg-base-darker'}">
				
				<div class="flex-shrink-0 pt-1">
					{#if notification.type === "LIKE"}
						<Heart class="w-6 h-6 text-accent-primary fill-accent-primary" />
					{:else if notification.type === "REPOST"}
						<Repeat2 class="w-6 h-6 text-accent-secondary" />
					{:else if notification.type === "FOLLOW"}
						<UserPlus class="w-6 h-6 text-[#1DA1F2]" />
					{:else if notification.type === "SYSTEM"}
						<ShieldAlert class="w-6 h-6 text-accent-primary" />
					{:else}
						<Sparkles class="w-6 h-6 text-text-main" />
					{/if}
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between mb-1">
						<div class="flex items-center space-x-2">
							{#if notification.actor}
								<img src={notification.actor.profileImage} alt="Avatar" class="w-6 h-6 object-cover" />
								<span class="font-bold text-text-main">{notification.actor.displayName}</span>
							{:else}
								<span class="font-bold text-accent-primary font-mono">SYSTEM</span>
							{/if}
						</div>
						<span class="text-xs text-text-muted font-mono uppercase">
							{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
						</span>
					</div>

					{#if notification.type === "LIKE"}
						<p class="text-text-muted text-sm">liked your post</p>
						<p class="mt-2 text-text-main text-sm pl-4 border-l-2 border-base-border/50 line-clamp-2">
							{notification.post.content}
						</p>
					{:else if notification.type === "REPOST"}
						<p class="text-text-muted text-sm">reposted your post</p>
						<p class="mt-2 text-text-main text-sm pl-4 border-l-2 border-base-border/50 line-clamp-2">
							{notification.post.content}
						</p>
					{:else if notification.type === "FOLLOW"}
						<p class="text-text-muted text-sm">followed you</p>
					{:else if notification.type === "SYSTEM"}
						<p class="text-accent-primary font-mono text-sm mt-1">{notification.message}</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
