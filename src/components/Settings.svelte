<script>
  import { onMount } from 'svelte';
  import { themes, applyTheme } from '../lib/theme.js';
  import { Palette, ShieldAlert } from 'lucide-svelte';

  let currentTheme = $state('matrix-beyond');

  onMount(() => {
    currentTheme = localStorage.getItem('40forty-theme') || 'matrix-beyond';
  });

  function selectTheme(themeId) {
    currentTheme = themeId;
    applyTheme(themeId);
  }
</script>

<div class="sharp-panel p-6 mb-8 mt-6">
  <div class="flex items-center space-x-3 border-b border-base-border pb-4 mb-6">
    <Palette class="text-accent-primary" size={24} />
    <h2 class="text-2xl font-bold font-mono text-text-main uppercase tracking-widest text-glitch">System_Config</h2>
  </div>

  <div class="space-y-6">
    <div>
      <h3 class="text-accent-secondary font-mono text-sm uppercase mb-4">> SELECT_THEME</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each themes as theme}
          <button 
            class="sharp-card p-4 flex flex-col text-left group transition-all duration-75 ease-out outline-none 
              {currentTheme === theme.id ? 'border-accent-secondary shadow-[4px_4px_0px_0px_var(--theme-accent-secondary)]' : 'hover:border-accent-primary'}"
            onclick={() => selectTheme(theme.id)}
          >
            <span class="font-bold font-mono mb-3 uppercase tracking-wider {currentTheme === theme.id ? 'text-accent-secondary text-glitch' : 'text-text-main group-hover:text-accent-primary'}">
              {theme.name}
            </span>
            <div class="flex space-x-2">
              <div class="w-6 h-6 border border-white/20" style="background-color: {theme.colors['--theme-bg']}"></div>
              <div class="w-6 h-6 border border-white/20" style="background-color: {theme.colors['--theme-surface']}"></div>
              <div class="w-6 h-6 border border-white/20" style="background-color: {theme.colors['--theme-accent-primary']}"></div>
              <div class="w-6 h-6 border border-white/20" style="background-color: {theme.colors['--theme-accent-secondary']}"></div>
            </div>
            
            {#if currentTheme === theme.id}
              <div class="mt-3 text-xs text-accent-secondary font-mono animate-pulse uppercase">> ACTIVE</div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
    
    <div class="mt-8 pt-6 border-t border-base-border">
      <div class="flex items-start space-x-3 bg-accent-primary/10 border border-accent-primary p-4 text-accent-primary">
        <ShieldAlert size={20} class="flex-shrink-0 mt-0.5" />
        <div>
          <h4 class="font-bold font-mono uppercase text-sm mb-1">> ADVANCED_DANGER_ZONE</h4>
          <p class="font-sans text-sm text-text-muted">Manually editing hex codes is disabled in this environment. Contact sysadmin for manual override.</p>
        </div>
      </div>
    </div>
  </div>
</div>
