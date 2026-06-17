<script>
	import { getContext } from "svelte";
	import { gql } from "@urql/svelte";
	import { Code, MessageCircle, Box } from "lucide-svelte";
	
	let { onLogin } = $props();
	const client = getContext("urql");

	const SIGN_UP_MUTATION = gql`
		mutation SignUp($username: String!, $email: String!, $password: String!, $displayName: String!) {
			signUp(username: $username, email: $email, password: $password, displayName: $displayName) {
				token {
					accessToken
				}
				user {
					id
					username
					displayName
					profileImage
				}
			}
		}
	`;

	let isLoading = $state(false);
	let error = $state(null);

	async function handleLogin(provider) {
		isLoading = true;
		error = null;
		
		// Mock OAuth callback generating random username for testing
		const randomStr = Math.random().toString(36).substring(7);
		const username = `${provider}_user_${randomStr}`;
		
		try {
			const result = await client.mutation(SIGN_UP_MUTATION, {
				username: username,
				email: `${username}@${provider}.local`,
				password: "mock_oauth_password",
				displayName: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`
			}).toPromise();

			if (result.error) {
				throw new Error(result.error.message);
			}

			if (result.data?.signUp) {
				onLogin({
					provider,
					token: result.data.signUp.token.accessToken,
					user: result.data.signUp.user
				});
			}
		} catch (err) {
			console.error("Auth Error:", err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="min-h-screen bg-base-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
	<!-- Grid Background -->
	<div class="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none"></div>

	<!-- Auth Container -->
	<div class="sharp-card max-w-md w-full p-8 md:p-10 relative z-10 before:absolute before:inset-0 before:bg-accent-secondary/5 before:-z-10 backdrop-blur-sm">
		<!-- Header -->
		<div class="text-center mb-10">
			<div class="inline-flex items-center justify-center w-16 h-16 border-2 border-accent-primary shadow-[4px_4px_0px_0px_var(--theme-accent-secondary)] mb-6 bg-base-darker">
				<span class="text-3xl font-bold text-accent-primary font-mono tracking-tighter">40</span>
			</div>
			<h1 class="text-3xl font-bold text-text-main text-glitch tracking-tight">Forty</h1>
			<p class="mt-2 text-text-muted font-mono text-sm uppercase tracking-widest">> Establish_Connection</p>
		</div>

		<!-- OAuth Buttons -->
		<div class="space-y-4">
			<button 
				onclick={() => handleLogin('github')}
				class="w-full flex items-center justify-center space-x-3 p-4 border border-base-border bg-base-darker hover:border-accent-secondary hover:text-accent-secondary transition-all duration-200 group relative overflow-hidden"
			>
				<div class="absolute inset-0 bg-accent-secondary/10 translate-y-full group-hover:translate-y-0 transition-transform duration-200"></div>
				<Code class="w-5 h-5 relative z-10" />
				<span class="font-mono uppercase text-sm font-bold tracking-widest relative z-10">Connect via GitHub</span>
			</button>

			<button 
				onclick={() => handleLogin('google')}
				class="w-full flex items-center justify-center space-x-3 p-4 border border-base-border bg-base-darker hover:border-accent-primary hover:text-accent-primary transition-all duration-200 group relative overflow-hidden"
			>
				<div class="absolute inset-0 bg-accent-primary/10 translate-y-full group-hover:translate-y-0 transition-transform duration-200"></div>
				<Box class="w-5 h-5 relative z-10" />
				<span class="font-mono uppercase text-sm font-bold tracking-widest relative z-10">Connect via Google</span>
			</button>

			<button 
				onclick={() => handleLogin('twitter')}
				class="w-full flex items-center justify-center space-x-3 p-4 border border-base-border bg-base-darker hover:border-[#1DA1F2] hover:text-[#1DA1F2] transition-all duration-200 group relative overflow-hidden"
			>
				<div class="absolute inset-0 bg-[#1DA1F2]/10 translate-y-full group-hover:translate-y-0 transition-transform duration-200"></div>
				<MessageCircle class="w-5 h-5 relative z-10" />
				<span class="font-mono uppercase text-sm font-bold tracking-widest relative z-10">Connect via Twitter</span>
			</button>

			<button 
				onclick={() => handleLogin('test')}
				class="w-full flex items-center justify-center space-x-3 p-4 border border-base-border bg-base-darker hover:border-text-main hover:text-text-main transition-all duration-200 group relative overflow-hidden"
			>
				<div class="absolute inset-0 bg-text-main/10 translate-y-full group-hover:translate-y-0 transition-transform duration-200"></div>
				<span class="font-mono uppercase text-sm font-bold tracking-widest relative z-10">Test App (Login as Test User)</span>
			</button>
		</div>

		<div class="mt-10 pt-6 border-t border-base-border text-center">
			<p class="text-xs text-text-muted font-mono leading-relaxed">
				By connecting, you agree to the <br/> <span class="text-accent-secondary hover:underline cursor-pointer">Terms of Service</span> & <span class="text-accent-primary hover:underline cursor-pointer">Privacy Protocol</span>.
			</p>
		</div>
	</div>

	<!-- Decorative Elements -->
	<div class="absolute top-1/4 left-10 w-32 h-32 border border-accent-secondary/20 rounded-full blur-3xl"></div>
	<div class="absolute bottom-1/4 right-10 w-48 h-48 border border-accent-primary/20 rounded-full blur-3xl"></div>
</div>
