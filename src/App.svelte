<script>
  // The shell from the original 40 build: nav rail on the left, the wipe clock on the right,
  // a bottom bar with a raised centre button on phones.
  import Activity from '@lucide/svelte/icons/activity';
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import User from '@lucide/svelte/icons/user';
  import Auth from './components/Auth.svelte';
  import Timer from './components/Timer.svelte';
  import { WIPE_HABITS_COPY, app, loadSession } from '#lib/app.svelte.js';
  import { href, route } from '#lib/router.svelte.js';
  import Feed from './views/Feed.svelte';
  import Person from './views/Person.svelte';
  import Post from './views/Post.svelte';
  import Stats from './views/Stats.svelte';
  import Track from './views/Track.svelte';
  import You from './views/You.svelte';

  const VIEWS = { track: Track, stats: Stats, feed: Feed, post: Post, person: Person, you: You };
  // [route, label, icon, other routes that light the same tab]
  const TABS = [
    ['track', 'Track', CalendarCheck, []],
    ['stats', 'Stats', Activity, []],
    ['feed', 'Feed', MessageSquare, ['post', 'person']],
    ['you', 'Entity', User, []],
  ];
  // The raised button sits in the middle of the phone bar.
  const PHONE_SPLIT = 2;
  const ICON_STROKE_ACTIVE = 2.5;
  const ICON_STROKE = 1.5;

  const View = $derived(VIEWS[route.name] || Track);
  const isActive = (name, also) => route.name === name || also.includes(route.name);

  loadSession();
</script>

{#snippet phoneTab([name, label, Icon, also])}
  <a
    href={href(name)}
    class="flex flex-1 justify-center py-1 {isActive(name, also) ? 'text-moss' : 'text-mute'}"
    aria-label={label}
    aria-current={isActive(name, also) ? 'page' : undefined}
  >
    <Icon class="h-6 w-6" />
  </a>
{/snippet}

{#if !app.ready}
  <div class="flex min-h-dvh items-center justify-center">
    <div class="logo-box h-16 w-16 animate-pulse text-3xl">40</div>
  </div>
{:else if app.down}
  <div class="mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center gap-4 p-6">
    <div class="logo-box h-16 w-16 text-3xl">40</div>
    <p class="font-mono text-sm uppercase text-ember" role="alert">&gt; {app.down}</p>
    <button class="btn-quiet" onclick={loadSession}>Try again</button>
  </div>
{:else if !app.user}
  <Auth />
{:else}
  <div class="mx-auto flex min-h-dvh max-w-7xl">
    <!-- Left rail: tablets and up -->
    <aside class="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col border-r border-line bg-ink p-4 md:flex lg:w-64 lg:p-6">
      <a href={href('track')} class="mb-12 flex items-center justify-center lg:justify-start">
        <span class="logo-box h-10 w-10 text-xl">40</span>
        <span class="text-glitch ml-3 hidden text-2xl lg:block">Forty</span>
      </a>

      <nav class="flex-1 space-y-2">
        {#each TABS as [name, label, Icon, also] (name)}
          {@const active = isActive(name, also)}
          <a
            href={href(name)}
            class="flex items-center justify-center gap-4 border p-3 transition-colors duration-75 lg:justify-start
              {active ? 'border-line bg-panel text-moss' : 'border-transparent text-mute hover:text-ember'}"
            aria-current={active ? 'page' : undefined}
          >
            <Icon class="h-6 w-6" strokeWidth={active ? ICON_STROKE_ACTIVE : ICON_STROKE} />
            <span class="hidden text-sm uppercase lg:block {active ? 'font-bold tracking-widest' : 'font-mono'}">
              {label}
            </span>
          </a>
        {/each}
      </nav>

      <a href={href('feed')} class="btn mt-auto py-3 lg:py-4">
        <SquareTerminal class="h-5 w-5" />
        <span class="hidden text-base lg:block">Execute</span>
      </a>
    </aside>

    <main class="min-w-0 flex-1 border-line pb-24 md:border-r md:pb-0">
      <header class="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur-md lg:px-6 lg:py-4">
        <h1 class="font-mono text-lg text-moss lg:text-xl">/ROOT/{route.name.toUpperCase()}</h1>
        <a href={href('track')} class="logo-box h-8 w-8 text-sm" aria-label="40, home">40</a>
      </header>

      <div class="mx-auto max-w-2xl p-4 lg:p-6">
        <!-- Phones and tablets have no right rail, so the clock opens the home screen instead. -->
        {#if route.name === 'track' && app.cycle}
          <div class="mb-4 xl:hidden"><Timer endsAt={app.cycle.endsAt} /></div>
        {/if}
        {#key route.name + route.param}
          <View id={route.param} />
        {/key}
      </div>
    </main>

    <!-- Right rail: wide screens -->
    <aside class="sticky top-0 hidden h-dvh w-80 shrink-0 space-y-6 overflow-y-auto p-6 xl:block">
      {#if app.cycle}<Timer endsAt={app.cycle.endsAt} />{/if}
      <div class="card space-y-2 font-mono text-xs uppercase">
        <p class="text-moss">&gt; Wipe protocol</p>
        <p class="text-mute">Posts, comments <span class="float-right text-ember">Deleted</span></p>
        <p class="text-mute">Profiles, follows <span class="float-right text-moss">Kept</span></p>
        <p class="text-mute">Your records <span class="float-right text-text">Your call</span></p>
        <p class="border-t border-line pt-2 normal-case text-mute">{WIPE_HABITS_COPY[app.wipeHabits]}</p>
      </div>
      <p class="label px-4 text-center">40 // DOGS © 2026</p>
    </aside>
  </div>

  <!-- Phone bottom bar -->
  <nav class="fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-line bg-ink p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
    {#each TABS.slice(0, PHONE_SPLIT) as tab (tab[0])}{@render phoneTab(tab)}{/each}
    <a
      href={href('feed')}
      class="-mt-8 flex h-12 w-12 shrink-0 items-center justify-center border-2 border-ink bg-ember text-ink shadow-[4px_4px_0_0_var(--color-moss)]"
      aria-label="Write a post"
    >
      <SquareTerminal class="h-5 w-5" />
    </a>
    {#each TABS.slice(PHONE_SPLIT) as tab (tab[0])}{@render phoneTab(tab)}{/each}
  </nav>
{/if}
