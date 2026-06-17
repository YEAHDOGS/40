<script>
	import { getContext } from "svelte";
	import { gql } from "@urql/svelte";
	import { Image, Smile, MapPin, Sparkles, X } from "lucide-svelte";

	const client = getContext("urql");

	let content = $state("");
	let mediaUrls = $state([]);
	let isSubmitting = $state(false);

	const CREATE_POST_MUTATION = gql`
		mutation CreatePost($input: CreatePostInput!) {
			createPost(input: $input) {
				id
				content
				postType
				createdAt
			}
		}
	`;

	async function handlePost() {
		if (!content.trim() && mediaUrls.length === 0) return;
		isSubmitting = true;
		
		const mediaInput = mediaUrls.map(url => ({
			url,
			type: "IMAGE"
		}));

		const result = await client.mutation(CREATE_POST_MUTATION, {
			input: {
				content,
				media: mediaInput
			}
		}).toPromise();

		isSubmitting = false;

		if (!result.error) {
			content = "";
			mediaUrls = [];
		} else {
			console.error(result.error);
		}
	}

	function mockAddImage() {
		const randomId = Math.floor(Math.random() * 1000);
		mediaUrls = [...mediaUrls, `https://picsum.photos/seed/${randomId}/800/400`];
	}

	function removeImage(index) {
		mediaUrls = mediaUrls.filter((_, i) => i !== index);
	}
</script>

<div class="sharp-card p-4 mb-6 relative group border-b-2 border-b-accent-primary">
	<div class="flex space-x-3 relative z-10">
		<div
			class="w-12 h-12 border-2 border-accent-secondary flex-shrink-0 bg-accent-secondary/10 flex items-center justify-center font-mono font-bold text-accent-secondary shadow-[2px_2px_0px_0px_var(--theme-accent-secondary)]"
		>
			U
		</div>

		<div class="flex-1">
			<textarea
				bind:value={content}
				placeholder="> INPUT_TEMPORARY_DATA... (TTL: 40_DAYS)"
				class="input-sharp min-h-[80px] resize-none"
			></textarea>

			<div class="flex items-center justify-between mt-3 pt-3 border-t border-base-border">
				<div class="flex space-x-2 text-text-muted">
					<button onclick={mockAddImage} class="p-2 hover:text-accent-secondary transition-colors duration-75">
						<Image size={20} strokeWidth={1.5} />
					</button>
					<button class="p-2 hover:text-accent-secondary transition-colors duration-75">
						<Sparkles size={20} strokeWidth={1.5} />
					</button>
					<button
						class="p-2 hover:text-accent-secondary transition-colors duration-75 hidden sm:block"
					>
						<Smile size={20} strokeWidth={1.5} />
					</button>
					<button
						class="p-2 hover:text-accent-secondary transition-colors duration-75 hidden sm:block"
					>
						<MapPin size={20} strokeWidth={1.5} />
					</button>
				</div>

				<button onclick={handlePost} disabled={(!content.trim() && mediaUrls.length === 0) || isSubmitting} class="button-primary">
					{isSubmitting ? "EXECUTING..." : "EXECUTE"}
				</button>
			</div>

			{#if mediaUrls.length > 0}
				<div class="mt-4 grid grid-cols-2 gap-2">
					{#each mediaUrls as url, i}
						<div class="relative group aspect-video">
							<img src={url} alt="Attached media" class="w-full h-full object-cover border border-base-border" />
							<button 
								onclick={() => removeImage(i)}
								class="absolute top-2 right-2 bg-base-darker/80 text-text-main p-1 hover:text-accent-primary transition-colors border border-base-border"
							>
								<X size={16} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
