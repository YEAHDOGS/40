<script>
	import {
		Home,
		Compass,
		User,
		Settings,
		Bell,
		MessageSquare,
		SquareTerminal,
	} from "lucide-svelte";
	import Timer from "./Timer.svelte";
	import Trending from "./Trending.svelte";


	let { children, currentView = $bindable("home") } = $props();
</script>

<div class="max-w-7xl mx-auto flex min-h-screen">
	<!-- Left Sidebar Navigation -->
	<aside
		class="w-20 lg:w-64 border-r border-base-border flex-shrink-0 fixed h-full z-20 bg-base-bg"
	>
		<div class="flex flex-col h-full p-4 lg:p-6">
			<!-- Logo -->
			<div class="flex items-center justify-center lg:justify-start mb-12">
				<div
					class="w-10 h-10 border-2 border-accent-primary flex items-center justify-center shadow-[4px_4px_0px_0px_var(--theme-accent-secondary)]"
				>
					<span class="text-xl font-bold text-accent-primary font-mono tracking-tighter"
						>40</span
					>
				</div>
				<span
					class="ml-3 text-2xl font-bold text-text-main hidden lg:block tracking-tight text-glitch"
					>Forty</span
				>
			</div>

			<!-- Nav Links -->
			<nav class="flex-1 space-y-2">
				<button
					onclick={() => (currentView = "home")}
					class="w-full text-left flex items-center space-x-4 p-3 {currentView === 'home'
						? 'sharp-panel text-accent-secondary'
						: 'text-text-muted hover:text-accent-primary transition-colors duration-75'}"
				>
					<Home class="w-6 h-6" strokeWidth={currentView === "home" ? 2.5 : 1.5} />
					<span
						class="hidden lg:block uppercase text-sm {currentView === 'home'
							? 'font-bold tracking-widest'
							: 'font-mono'}">Sys.Home</span
					>
				</button>
				<button
					onclick={() => (currentView = "arcade")}
					class="w-full text-left flex items-center space-x-4 p-3 {currentView === 'arcade'
						? 'sharp-panel text-accent-secondary'
						: 'text-text-muted hover:text-accent-primary transition-colors duration-75'}"
				>
					<Compass class="w-6 h-6" strokeWidth={currentView === "arcade" ? 2.5 : 1.5} />
					<span class="hidden lg:block uppercase text-sm {currentView === 'arcade'
							? 'font-bold tracking-widest'
							: 'font-mono'}">Arcade</span>
				</button>
				<button
					onclick={() => (currentView = "notifications")}
					class="w-full text-left flex items-center space-x-4 p-3 {currentView === 'notifications'
						? 'sharp-panel text-accent-secondary'
						: 'text-text-muted hover:text-accent-primary transition-colors duration-75'}"
				>
					<Bell class="w-6 h-6" strokeWidth={currentView === "notifications" ? 2.5 : 1.5} />
					<span class="hidden lg:block uppercase text-sm {currentView === 'notifications'
							? 'font-bold tracking-widest'
							: 'font-mono'}">Alerts</span>
				</button>
				<button
					class="w-full text-left flex items-center space-x-4 p-3 text-text-muted hover:text-accent-primary transition-colors duration-75"
				>
					<MessageSquare class="w-6 h-6" strokeWidth={1.5} />
					<span class="hidden lg:block font-mono uppercase text-sm">Comms</span>
				</button>
				<button
					onclick={() => (currentView = "profile")}
					class="w-full text-left flex items-center space-x-4 p-3 {currentView === 'profile'
						? 'sharp-panel text-accent-secondary'
						: 'text-text-muted hover:text-accent-primary transition-colors duration-75'}"
				>
					<User class="w-6 h-6" strokeWidth={currentView === "profile" ? 2.5 : 1.5} />
					<span class="hidden lg:block uppercase text-sm {currentView === 'profile'
							? 'font-bold tracking-widest'
							: 'font-mono'}">Entity</span>
				</button>
				<button
					onclick={() => (currentView = "config")}
					class="w-full text-left flex items-center space-x-4 p-3 {currentView ===
					'config'
						? 'sharp-panel text-accent-secondary'
						: 'text-text-muted hover:text-accent-primary transition-colors duration-75'}"
				>
					<Settings class="w-6 h-6" strokeWidth={currentView === "config" ? 2.5 : 1.5} />
					<span
						class="hidden lg:block uppercase text-sm {currentView === 'config'
							? 'font-bold tracking-widest'
							: 'font-mono'}">Config</span
					>
				</button>
			</nav>

			<!-- Post Button -->
			<button
				onclick={() => (currentView = "home")}
				class="button-primary w-full mt-auto py-3 lg:py-4"
			>
				<SquareTerminal class="w-5 h-5 lg:mr-2" />
				<span class="hidden lg:block text-lg">Execute</span>
			</button>
		</div>
	</aside>

	<!-- Main Content Area -->
	<main
		class="flex-1 ml-20 lg:ml-64 border-r border-base-border min-h-screen pb-20 md:pb-0 xl:mr-80"
	>
		<!-- Top Nav / Header -->
		<header
			class="bg-base-bg/90 backdrop-blur-md sticky top-0 z-10 px-6 py-4 flex items-center justify-between border-b border-base-border"
		>
			<h1 class="text-xl font-bold font-mono text-accent-secondary">
				/ROOT/{currentView.toUpperCase()}
			</h1>
			<div
				class="w-8 h-8 border-2 border-accent-primary shadow-[2px_2px_0px_0px_var(--theme-accent-secondary)]"
			></div>
		</header>

		<div class="p-4 lg:p-6">
			{@render children?.()}
		</div>
	</main>

	<!-- Right Sidebar (Trends, Timer) -->
	<aside
		class="hidden xl:block w-80 flex-shrink-0 p-6 space-y-6 fixed right-0 h-full overflow-y-auto"
		style="left: calc(50% + 400px - 80px);"
	>
		<Timer />

		<Trending />

		<p class="text-xs text-text-muted text-center px-4 pt-4 font-mono">
			TOS_v1.0 | ENCRYPTED | 40Forty © 2026
		</p>
	</aside>
</div>

<!-- Mobile Bottom Nav -->
<div
	class="md:hidden fixed bottom-0 left-0 right-0 bg-base-bg border-t border-base-border p-3 flex justify-around items-center z-50"
>
	<button
		onclick={() => (currentView = "home")}
		class={currentView === "home" ? "text-accent-secondary" : "text-text-muted"}
		><Home class="w-6 h-6" /></button
	>
	<button class="text-text-muted"><Compass class="w-6 h-6" /></button>
	<button
		onclick={() => (currentView = "home")}
		class="w-12 h-12 bg-accent-primary border-2 border-base-bg flex items-center justify-center shadow-[4px_4px_0px_0px_var(--theme-accent-secondary)] -mt-8"
	>
		<SquareTerminal class="w-5 h-5 text-black" />
	</button>
	<button class="text-text-muted"><Bell class="w-6 h-6" /></button>
	<button
		onclick={() => (currentView = "config")}
		class={currentView === "config" ? "text-accent-secondary" : "text-text-muted"}
		><Settings class="w-6 h-6" /></button
	>
</div>
