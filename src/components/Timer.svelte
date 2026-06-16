<script>
  import { onMount } from 'svelte';
  import { Timer } from 'lucide-svelte';
  
  // Mock the global deletion date
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 15);
  endDate.setHours(endDate.getHours() + 14);

  let timeLeft = $state({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  function updateTimer() {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    
    if (diff <= 0) {
      timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return;
    }
    
    timeLeft = {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60)
    };
  }

  onMount(() => {
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="sharp-panel p-4 flex flex-col items-center justify-center space-y-4 relative w-full border-t-4 border-t-accent-primary">
  
  <div class="flex items-center space-x-2 text-accent-primary font-mono w-full justify-between border-b border-base-border pb-2">
    <div class="flex items-center space-x-2">
      <Timer size={18} strokeWidth={2} />
      <span class="text-xs font-bold uppercase tracking-widest">Global Wipe</span>
    </div>
    <span class="text-xs text-text-muted">TTL_COUNTDOWN</span>
  </div>
  
  <div class="flex items-center space-x-4 text-3xl font-bold text-text-main font-mono">
    <div class="flex flex-col items-center">
      <span class="text-glitch text-accent-secondary">{timeLeft.days.toString().padStart(2, '0')}</span>
      <span class="text-[10px] text-text-muted uppercase tracking-widest mt-1">Days</span>
    </div>
    <span class="text-base-border pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-glitch text-accent-secondary">{timeLeft.hours.toString().padStart(2, '0')}</span>
      <span class="text-[10px] text-text-muted uppercase tracking-widest mt-1">Hrs</span>
    </div>
    <span class="text-base-border pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-glitch text-accent-secondary">{timeLeft.minutes.toString().padStart(2, '0')}</span>
      <span class="text-[10px] text-text-muted uppercase tracking-widest mt-1">Min</span>
    </div>
    <span class="text-base-border pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-glitch text-accent-primary animate-pulse">{timeLeft.seconds.toString().padStart(2, '0')}</span>
      <span class="text-[10px] text-accent-primary uppercase tracking-widest mt-1">Sec</span>
    </div>
  </div>
</div>
