<script>
	import { onMount, getContext } from "svelte";
	import { Timer as TimerIcon, Settings as SettingsIcon, X } from "lucide-svelte";
	import { queryStore, gql } from "@urql/svelte";
	import { presets, communityThemes } from "../lib/clockPresets.js";

	const NextWipeQuery = gql`
		query GetNextWipe {
			nextWipe
		}
	`;

	const TriggerWipeMutation = gql`
		mutation TriggerWipe {
			triggerWipe
		}
	`;

	const client = getContext("urql");
	const wipeQuery = queryStore({
		client,
		query: NextWipeQuery,
		requestPolicy: "cache-and-network"
	});

	let endDate = $state(null);
	let timeLeft = $state({ days: 0, hours: 0, minutes: 0, seconds: 0 });
	let frame = 0;

	// Customizer State
	let showPanel = $state(false);
	let selectedThemeId = $state("vintage");
	let colorBg = $state("#1c1c1c");
	let colorTile = $state("#e4e4e4");
	let colorDigit = $state("#1a1a1a");
	let colorLabel = $state("#ff6600");
	let customCss = $state("");

	$effect(() => {
		if ($wipeQuery.data && $wipeQuery.data.nextWipe) {
			endDate = new Date($wipeQuery.data.nextWipe);
		}
	});

	function updateTimer() {
		if (!endDate) {
			frame = requestAnimationFrame(updateTimer);
			return;
		}

		const now = new Date();
		const diff = endDate.getTime() - now.getTime();

		if (diff <= 0) {
			timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
			client.mutation(TriggerWipeMutation).toPromise().then(() => {
				wipeQuery.reexecute({ requestPolicy: 'network-only' });
			});
			return;
		}

		timeLeft = {
			days: Math.floor(diff / (1000 * 60 * 60 * 24)),
			hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
			minutes: Math.floor((diff / 1000 / 60) % 60),
			seconds: Math.floor((diff / 1000) % 60)
		};

		frame = requestAnimationFrame(updateTimer);
	}

	onMount(() => {
		// Restore theme from localStorage
		const saved = localStorage.getItem("40forty_timer_theme");
		if (saved) {
			try {
				const data = JSON.parse(saved);
				colorBg = data.colorBg ?? colorBg;
				colorTile = data.colorTile ?? colorTile;
				colorDigit = data.colorDigit ?? colorDigit;
				colorLabel = data.colorLabel ?? colorLabel;
				customCss = data.customCss ?? customCss;
				selectedThemeId = data.selectedThemeId ?? selectedThemeId;
			} catch (e) {
				console.error("Failed to load theme");
			}
		}

		frame = requestAnimationFrame(updateTimer);
		return () => cancelAnimationFrame(frame);
	});

	function togglePanel() {
		showPanel = !showPanel;
	}

	function applyPreset() {
		const preset = presets.find(p => p.id === selectedThemeId);
		if (preset) {
			colorBg = preset.colorBg;
			colorTile = preset.colorTile;
			colorDigit = preset.colorDigit;
			colorLabel = preset.colorLabel;
			customCss = preset.css;
			saveTheme();
		}
	}

	function applyCommunityTheme(theme) {
		selectedThemeId = theme.id;
		colorBg = theme.colorBg;
		colorTile = theme.colorTile;
		colorDigit = theme.colorDigit;
		colorLabel = theme.colorLabel;
		customCss = theme.css;
		saveTheme();
	}

	function saveTheme() {
		const config = {
			selectedThemeId,
			colorBg,
			colorTile,
			colorDigit,
			colorLabel,
			customCss
		};
		localStorage.setItem("40forty_timer_theme", JSON.stringify(config));
	}

	// Reactive variable style injection
	let dynamicStyles = $derived(`
		--clock-bg: ${colorBg};
		--tile-bg: ${colorTile};
		--digit-color: ${colorDigit};
		--label-color: ${colorLabel};
	`);
</script>

<div class="timer-wrapper" style={dynamicStyles}>
	<!-- Dynamic CSS Injection (strictly scoped inside the wrapper) -->
	{#if customCss}
		<svelte:element this="style">
			{@html customCss}
		</svelte:element>
	{/if}

	<!-- Left and Right mechanical hinge brackets for split flip look -->
	<div class="bracket bracket-left"></div>
	<div class="bracket bracket-right"></div>

	<!-- Title Header -->
	<div class="timer-header">
		<div class="flex items-center space-x-2">
			<TimerIcon size={14} class="animate-pulse text-accent-primary" />
			<span class="timer-title">Time to Global Wipe</span>
		</div>
		
		<!-- Customize Gear Icon Button -->
		<button onclick={togglePanel} class="customizer-toggle-btn" title="Customize Design">
			<SettingsIcon size={14} />
		</button>
	</div>

	<!-- Flip Clock Containers -->
	<div class="flip-clock-container">
		<!-- Days -->
		<div class="flip-tile-col">
			<div class="flip-card">
				<span class="flip-digit">{timeLeft.days.toString().padStart(2, "0")}</span>
			</div>
			<span class="flip-label">Days</span>
		</div>

		<span class="flip-colon">:</span>

		<!-- Hours -->
		<div class="flip-tile-col">
			<div class="flip-card">
				<span class="flip-digit">{timeLeft.hours.toString().padStart(2, "0")}</span>
			</div>
			<span class="flip-label">Hours</span>
		</div>

		<span class="flip-colon">:</span>

		<!-- Minutes -->
		<div class="flip-tile-col">
			<div class="flip-card">
				<span class="flip-digit">{timeLeft.minutes.toString().padStart(2, "0")}</span>
			</div>
			<span class="flip-label">Mins</span>
		</div>

		<span class="flip-colon">:</span>

		<!-- Seconds -->
		<div class="flip-tile-col">
			<div class="flip-card">
				<span class="flip-digit">{timeLeft.seconds.toString().padStart(2, "0")}</span>
			</div>
			<span class="flip-label">Secs</span>
		</div>
	</div>

	<!-- Customizer Drawer Panel -->
	{#if showPanel}
		<div class="customizer-drawer">
			<div class="drawer-header">
				<span>Style Protocol Editor</span>
				<button onclick={togglePanel} class="drawer-close-btn">
					<X size={14} />
				</button>
			</div>

			<!-- Preset Dropdown -->
			<div class="drawer-group">
				<label class="drawer-label-heading">Theme Preset</label>
				<select bind:value={selectedThemeId} onchange={applyPreset} class="drawer-select">
					{#each presets as preset}
						<option value={preset.id}>{preset.name}</option>
					{/each}
				</select>
			</div>

			<!-- Quick Color Pickers -->
			<div class="drawer-group">
				<label class="drawer-label-heading">Color Variables</label>
				<div class="picker-grid">
					<div class="picker-item">
						<span>Bg</span>
						<input type="color" bind:value={colorBg} oninput={saveTheme} />
					</div>
					<div class="picker-item">
						<span>Tile</span>
						<input type="color" bind:value={colorTile} oninput={saveTheme} />
					</div>
					<div class="picker-item">
						<span>Digits</span>
						<input type="color" bind:value={colorDigit} oninput={saveTheme} />
					</div>
					<div class="picker-item">
						<span>Labels</span>
						<input type="color" bind:value={colorLabel} oninput={saveTheme} />
					</div>
				</div>
			</div>

			<!-- Direct CSS Overrides Textarea -->
			<div class="drawer-group">
				<label class="drawer-label-heading">Custom CSS (Scoped Overrides)</label>
				<textarea
					bind:value={customCss}
					oninput={saveTheme}
					placeholder={"/* Write direct CSS rules here */\n.flip-card { border: 1px solid cyan; }"}
					class="drawer-textarea"
				></textarea>
			</div>

			<!-- Community Gallery List -->
			<div class="drawer-group">
				<label class="drawer-label-heading">Browse Uploads Gallery</label>
				<div class="gallery-row">
					{#each communityThemes as theme}
						<button
							onclick={() => applyCommunityTheme(theme)}
							class="gallery-theme-tag {selectedThemeId === theme.id ? 'active' : ''}"
						>
							{theme.name}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	.timer-wrapper {
		position: relative;
		width: 100%;
		border-radius: 12px;
		padding: 20px 14px;
		background: var(--clock-bg, #1c1c1c);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 8px 16px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.3s ease;
		overflow: hidden;
	}

	/* Metal hinges on left/right edges */
	.bracket {
		position: absolute;
		width: 6px;
		height: 32px;
		background: #3e3e3e;
		background-image: linear-gradient(to right, #4e4e4e, #2e2e2e);
		border-radius: 3px;
		top: 55%;
		transform: translateY(-50%);
		box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.7);
		border: 1px solid #1a1a1a;
		z-index: 10;
	}
	.bracket-left {
		left: -3px;
	}
	.bracket-right {
		right: -3px;
	}

	.timer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		border-b: 1px solid rgba(255, 255, 255, 0.05);
		padding-bottom: 8px;
		margin-bottom: 14px;
		z-index: 2;
	}

	.timer-title {
		font-family: monospace;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: rgba(255, 255, 255, 0.4);
	}

	.customizer-toggle-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: color 0.15s ease;
		display: flex;
		align-items: center;
		padding: 2px;

		&:hover {
			color: var(--label-color, #ff6600);
		}
	}

	.flip-clock-container {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		gap: 8px;
		z-index: 2;
	}

	.flip-tile-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 60px;
	}

	.flip-card {
		position: relative;
		width: 100%;
		height: 60px;
		border-radius: 6px;
		background-color: var(--tile-bg, #e4e4e4);
		/* Premium 3D look with overlays */
		background-image: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.25) 0%,
			rgba(255, 255, 255, 0.05) 50%,
			rgba(0, 0, 0, 0.08) 50%,
			rgba(0, 0, 0, 0.25) 100__
		);
		display: flex;
		justify-content: center;
		align-items: center;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6);
		overflow: hidden;
		border: 1px solid rgba(0, 0, 0, 0.15);

		/* Horizontal center split crease line */
		&::after {
			content: '';
			position: absolute;
			left: 0;
			right: 0;
			top: 50%;
			height: 2px;
			background: rgba(0, 0, 0, 0.18);
			border-top: 1px solid rgba(0, 0, 0, 0.3);
			border-bottom: 1px solid rgba(255, 255, 255, 0.2);
			z-index: 4;
		}
	}

	.flip-digit {
		font-family: 'Inter', 'Helvetica Neue', 'Arial Black', sans-serif;
		font-size: 2rem;
		font-weight: 900;
		color: var(--digit-color, #1a1a1a);
		letter-spacing: -1px;
		line-height: 1;
		z-index: 2;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
		font-feature-settings: "tnum";
	}

	.flip-label {
		font-family: monospace;
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--label-color, #ff6600);
		text-transform: uppercase;
		letter-spacing: 1.2px;
	}

	.flip-colon {
		font-size: 1.5rem;
		color: rgba(255, 255, 255, 0.15);
		font-weight: bold;
		padding-bottom: 18px;
		animation: pulse-light 1.5s infinite alternate;
	}

	@keyframes pulse-light {
		from { opacity: 0.3; }
		to { opacity: 0.9; }
	}

	/* Drawer customizer panel CSS */
	.customizer-drawer {
		width: 100%;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		margin-top: 16px;
		padding-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 5;
		animation: slide-down 0.25s ease-out;
	}

	@keyframes slide-down {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: monospace;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}

	.drawer-close-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.3);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 2px;
		&:hover {
			color: white;
		}
	}

	.drawer-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.drawer-label-heading {
		font-family: monospace;
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.drawer-select {
		background: #2a2a2a;
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 6px 10px;
		font-family: monospace;
		font-size: 0.75rem;
		cursor: pointer;
		outline: none;

		&:focus {
			border-color: var(--label-color, #ff6600);
		}
	}

	.picker-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}

	.picker-item {
		background: #2a2a2a;
		border-radius: 4px;
		padding: 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		border: 1px solid rgba(255, 255, 255, 0.08);

		span {
			font-family: monospace;
			font-size: 0.6rem;
			color: rgba(255, 255, 255, 0.5);
		}

		input[type="color"] {
			background: none;
			border: none;
			width: 24px;
			height: 24px;
			cursor: pointer;
			padding: 0;
			border-radius: 2px;
			overflow: hidden;
		}
	}

	.drawer-textarea {
		background: #181818;
		color: #55ff55;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.7rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 8px;
		min-height: 80px;
		resize: vertical;
		outline: none;

		&:focus {
			border-color: var(--label-color, #ff6600);
		}
	}

	.gallery-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.gallery-theme-tag {
		background: #252525;
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		padding: 4px 8px;
		font-family: monospace;
		font-size: 0.65rem;
		cursor: pointer;
		transition: all 0.15s ease;

		&:hover {
			background: #303030;
			color: white;
		}

		&.active {
			background: rgba(255, 102, 0, 0.1);
			border-color: var(--label-color, #ff6600);
			color: white;
		}
	}
</style>
