<script>
	import { Image, Smile, MapPin, Sparkles } from "lucide-svelte";

	let content = $state("");

	function handlePost() {
		// In a real app we would call the urql mutation here
		if (!content.trim()) return;
		console.log("Posting:", content);
		content = "";
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
					<button class="p-2 hover:text-accent-secondary transition-colors duration-75">
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

				<button onclick={handlePost} disabled={!content.trim()} class="button-primary">
					EXECUTE
				</button>
			</div>
		</div>
	</div>
</div>
