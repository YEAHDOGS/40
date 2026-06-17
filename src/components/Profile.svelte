<script>
	import { getContext } from "svelte";
	import { queryStore, gql } from "@urql/svelte";
	import { MapPin, Link as LinkIcon, Calendar, CheckCircle2 } from "lucide-svelte";
	import { format } from "date-fns";

	let { userId = "mock_user_id" } = $props();

	const UserProfileQuery = gql`
		query GetUserProfile($id: ID!) {
			user(id: $id) {
				id
				username
				displayName
				bio
				profileImage
				bannerImage
				movies
				books
				music
				verified
				createdAt
				followersCount
				followingCount
				postsCount
			}
		}
	`;

	const UPDATE_PROFILE_MUTATION = gql`
		mutation UpdateProfile($input: UserProfileInput!) {
			updateProfile(input: $input) {
				id
				displayName
				bio
				movies
				books
				music
			}
		}
	`;

	let isEditing = $state(false);
	let editData = $state({
		displayName: "",
		bio: "",
		movies: "",
		books: "",
		music: ""
	});

	async function saveProfile() {
		const client = getContext("urql");
		await client.mutation(UPDATE_PROFILE_MUTATION, {
			input: editData
		}).toPromise();
		isEditing = false;
	}

	function startEdit(user) {
		editData = {
			displayName: user.displayName || "",
			bio: user.bio || "",
			movies: user.movies || "",
			books: user.books || "",
			music: user.music || ""
		};
		isEditing = true;
	}

	const userQuery = queryStore({
		client: getContext("urql"),
		query: UserProfileQuery,
		get variables() { return { id: userId }; },
	});
</script>

<div class="max-w-3xl mx-auto pb-20">
	{#if $userQuery.fetching}
		<div class="flex justify-center p-8">
			<div class="w-8 h-8 border-4 border-accent-secondary border-t-transparent animate-spin"></div>
		</div>
	{:else if $userQuery.error}
		<div class="p-4 bg-accent-primary/10 border border-accent-primary text-accent-primary font-mono text-sm uppercase">
			<p>> ERROR_LOADING_PROFILE: {$userQuery.error.message}</p>
		</div>
	{:else if $userQuery.data?.user}
		{@const user = $userQuery.data.user}
		
		<!-- Banner -->
		<div class="h-48 w-full bg-base-darker border-b border-base-border relative group overflow-hidden">
			{#if user.bannerImage}
				<img src={user.bannerImage} alt="Banner" class="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 transition-all duration-300" />
			{:else}
				<div class="absolute inset-0 bg-gradient-to-r from-base-darker to-accent-secondary/20"></div>
			{/if}
			<div class="absolute inset-0 bg-grid-pattern opacity-10"></div>
		</div>

		<!-- Profile Info -->
		<div class="px-6 relative">
			<div class="flex justify-between items-start">
				<div class="w-32 h-32 -mt-16 border-4 border-base-bg bg-base-darker relative z-10 shadow-[4px_4px_0px_0px_var(--theme-accent-secondary)]">
					<img src={user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="Avatar" class="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" />
				</div>

				<div class="mt-4">
					{#if isEditing}
						<button onclick={saveProfile} class="button-primary px-6 py-2 uppercase font-bold tracking-widest text-sm">
							Save
						</button>
						<button onclick={() => isEditing = false} class="button-outline ml-2 px-6 py-2 uppercase font-bold tracking-widest text-sm text-text-muted hover:text-text-main border-base-border hover:border-text-main">
							Cancel
						</button>
					{:else}
						<button onclick={() => startEdit(user)} class="button-outline px-6 py-2 uppercase font-bold tracking-widest text-sm">
							Edit Profile
						</button>
					{/if}
				</div>
			</div>

			<div class="mt-4">
				<div class="flex items-center space-x-2">
					{#if isEditing}
						<input bind:value={editData.displayName} type="text" class="input-sharp text-2xl font-bold py-1 px-2 w-full max-w-sm" placeholder="Display Name" />
					{:else}
						<h1 class="text-2xl font-bold text-text-main">{user.displayName}</h1>
					{/if}
					{#if user.verified && !isEditing}
						<CheckCircle2 class="text-accent-secondary w-5 h-5" />
					{/if}
				</div>
				<p class="text-text-muted font-mono">@{user.username}</p>

				{#if isEditing}
					<div class="mt-4 space-y-4 max-w-lg">
						<div>
							<label for="edit-bio" class="text-xs font-mono text-accent-secondary uppercase mb-1 block">Bio</label>
							<textarea id="edit-bio" bind:value={editData.bio} class="input-sharp w-full h-20 resize-none text-sm" placeholder="Tell us about yourself..."></textarea>
						</div>
						<div>
							<label for="edit-movies" class="text-xs font-mono text-accent-primary uppercase mb-1 block">Favorite Movies</label>
							<input id="edit-movies" bind:value={editData.movies} type="text" class="input-sharp w-full text-sm" placeholder="Blade Runner, The Matrix..." />
						</div>
						<div>
							<label for="edit-books" class="text-xs font-mono text-accent-secondary uppercase mb-1 block">Favorite Books</label>
							<input id="edit-books" bind:value={editData.books} type="text" class="input-sharp w-full text-sm" placeholder="Neuromancer, Snow Crash..." />
						</div>
						<div>
							<label for="edit-music" class="text-xs font-mono text-accent-primary uppercase mb-1 block">Favorite Music</label>
							<input id="edit-music" bind:value={editData.music} type="text" class="input-sharp w-full text-sm" placeholder="Synthwave, Cyberpunk..." />
						</div>
					</div>
				{:else}
					{#if user.bio}
						<p class="mt-4 text-text-main leading-relaxed">{user.bio}</p>
					{/if}
					
					{#if user.movies || user.books || user.music}
						<div class="mt-6 space-y-3 p-4 bg-base-darker border border-base-border border-l-4 border-l-accent-primary max-w-lg">
							{#if user.movies}
								<div class="flex flex-col">
									<span class="text-xs font-mono text-accent-primary uppercase">Movies</span>
									<span class="text-text-main text-sm">{user.movies}</span>
								</div>
							{/if}
							{#if user.books}
								<div class="flex flex-col">
									<span class="text-xs font-mono text-accent-secondary uppercase">Books</span>
									<span class="text-text-main text-sm">{user.books}</span>
								</div>
							{/if}
							{#if user.music}
								<div class="flex flex-col">
									<span class="text-xs font-mono text-accent-primary uppercase">Music</span>
									<span class="text-text-main text-sm">{user.music}</span>
								</div>
							{/if}
						</div>
					{/if}
				{/if}

				<div class="flex flex-wrap gap-4 mt-6 text-sm text-text-muted font-mono">
					<div class="flex items-center space-x-1">
						<Calendar class="w-4 h-4" />
						<span>Joined {format(new Date(user.createdAt), "MMMM yyyy")}</span>
					</div>
				</div>

				<div class="flex space-x-6 mt-6 pt-6 border-t border-base-border">
					<div class="flex space-x-2 items-baseline">
						<span class="font-bold text-accent-secondary text-lg">{user.postsCount}</span>
						<span class="text-text-muted font-mono text-xs uppercase">Posts</span>
					</div>
					<div class="flex space-x-2 items-baseline cursor-pointer hover:text-accent-primary transition-colors">
						<span class="font-bold text-text-main">{user.followingCount}</span>
						<span class="text-text-muted font-mono text-xs uppercase">Following</span>
					</div>
					<div class="flex space-x-2 items-baseline cursor-pointer hover:text-accent-primary transition-colors">
						<span class="font-bold text-text-main">{user.followersCount}</span>
						<span class="text-text-muted font-mono text-xs uppercase">Followers</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-base-border mt-8">
			<button class="flex-1 py-4 text-center border-b-2 border-accent-secondary text-accent-secondary font-bold uppercase tracking-wider text-sm">
				Posts
			</button>
			<button class="flex-1 py-4 text-center text-text-muted hover:text-text-main hover:bg-base-darker transition-colors uppercase tracking-wider text-sm font-mono">
				Replies
			</button>
			<button class="flex-1 py-4 text-center text-text-muted hover:text-text-main hover:bg-base-darker transition-colors uppercase tracking-wider text-sm font-mono">
				Media
			</button>
			<button class="flex-1 py-4 text-center text-text-muted hover:text-text-main hover:bg-base-darker transition-colors uppercase tracking-wider text-sm font-mono">
				Likes
			</button>
		</div>

		<!-- Feed Placeholder -->
		<div class="p-8 text-center text-text-muted font-mono border-x border-b border-base-border bg-base-darker/50">
			> NO_DATA_AVAILABLE
		</div>
	{/if}
</div>
