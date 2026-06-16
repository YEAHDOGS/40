<script>
	import { onMount } from "svelte";
	import { Timer as TimerIcon } from "lucide-svelte";
	import { fly } from "svelte/transition";

	// Mock the global deletion date
	const endDate = new Date();
	endDate.setDate(endDate.getDate() + 15);
	endDate.setHours(endDate.getHours() + 14);

	let timeLeft = $state({ days: 0, hours: 0, minutes: 0, seconds: 0, ms: 0 });
	let frame = 0;

	function updateTimer() {
		const now = new Date();
		const diff = endDate.getTime() - now.getTime();

		if (diff <= 0) {
			timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0, ms: 0 };
			return;
		}

		timeLeft = {
			days: Math.floor(diff / (1000 * 60 * 60 * 24)),
			hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
			minutes: Math.floor((diff / 1000 / 60) % 60),
			seconds: Math.floor((diff / 1000) % 60),
			ms: Math.floor((diff % 1000) / 10),
		};

		frame = requestAnimationFrame(updateTimer);
	}

	onMount(() => {
		frame = requestAnimationFrame(updateTimer);
		return () => cancelAnimationFrame(frame);
	});
</script>

<div
	class="relative w-full rounded-2xl p-0.5 overflow-hidden shadow-2xl transition-shadow duration-700"
>
	<!-- Spinning Borders using standard Tailwind gradients -->
	<div
		class="absolute -inset-1/2 bg-gradient-to-tr from-accent-primary via-transparent to-accent-secondary animate-[spin_4s_linear_infinite] opacity-80 blur-sm"
	></div>
	<div
		class="absolute -inset-1/2 bg-gradient-to-bl from-accent-secondary via-transparent to-accent-primary animate-[spin_3s_linear_infinite] opacity-60 blur-md"
	></div>

	<!-- Inner Glass Panel -->
	<div
		class="relative bg-black/95 backdrop-blur-3xl rounded-xl p-6 flex flex-col items-center justify-center border border-white/10 shadow-inner z-10 overflow-hidden h-full"
	>
		<div
			class="flex items-center space-x-3 text-white/50 font-mono w-full justify-between border-b border-white/10 pb-4 z-10"
		>
			<div class="flex items-center space-x-3">
				<TimerIcon
					size={20}
					strokeWidth={1.5}
					class="animate-[spin_4s_linear_infinite] text-accent-primary drop-shadow-md"
				/>
				<span
					class="text-sm font-bold uppercase tracking-widest text-white/90 drop-shadow-sm"
					>Global Wipe</span
				>
			</div>
			<span class="text-xs text-white/30 tracking-widest uppercase hidden sm:block"
				>Countdown</span
			>
		</div>

		<!-- Glowing Continuous Numbers - Built with standard Tailwind classes -->
		<div class="flex items-baseline justify-center w-full relative z-10 pt-6 pb-2 space-x-1">
			{#snippet digitBlock(value, label, isPrimary)}
				<div class="flex flex-col items-center relative w-12 sm:w-14">
					<!-- Inner Digit Container -->
					<div
						class="relative h-14 sm:h-16 w-full overflow-hidden rounded-xl bg-white/5 border border-white/10 shadow-inner"
					>
						{#key value}
							<span
								in:fly={{ y: -30, duration: 400, opacity: 0 }}
								out:fly={{ y: 30, duration: 400, opacity: 0 }}
								class="absolute inset-0 flex items-center justify-center pb-1 text-2xl sm:text-3xl font-bold tabular-nums {isPrimary
									? 'text-accent-primary drop-shadow-lg'
									: 'text-white/90 drop-shadow-md'}"
							>
								{value.toString().padStart(2, "0")}
							</span>
						{/key}
					</div>
					<span class="mt-2 text-xs text-white/40 uppercase tracking-widest font-mono"
						>{label}</span
					>
				</div>
			{/snippet}

			{@render digitBlock(timeLeft.days, "Days", false)}
			<span
				class="text-xl sm:text-2xl text-white/20 animate-pulse pb-6 sm:pb-8 drop-shadow-md"
				>:</span
			>
			{@render digitBlock(timeLeft.hours, "Hours", false)}
			<span
				class="text-xl sm:text-2xl text-white/20 animate-pulse pb-6 sm:pb-8 drop-shadow-md"
				>:</span
			>
			{@render digitBlock(timeLeft.minutes, "Mins", false)}
			<span
				class="text-xl sm:text-2xl text-white/20 animate-pulse pb-6 sm:pb-8 drop-shadow-md"
				>:</span
			>
			{@render digitBlock(timeLeft.seconds, "Secs", true)}

			<!-- Milliseconds -->
			<div class="flex flex-col items-start justify-end pb-6 sm:pb-8 w-8 sm:w-10">
				<span
					class="text-sm sm:text-base font-bold text-accent-secondary font-mono tracking-widest tabular-nums drop-shadow-md"
				>
					.{timeLeft.ms.toString().padStart(2, "0")}
				</span>
			</div>
		</div>
	</div>
</div>
