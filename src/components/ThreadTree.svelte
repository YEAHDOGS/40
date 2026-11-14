<script>
  // A post and every reply of yours below it. A single reply continues straight down the spine; several
  // replies split into indented branches. Indents stop deepening after a few levels so a long
  // back-and-forth still fits a phone.
  import MemoryCard from './MemoryCard.svelte';
  import Self from './ThreadTree.svelte';

  const MAX_INDENT_DEPTH = 4;

  /**
   * @type {{ memory: any, threads: { children: Map<string, any[]> }, focus?: string, depth?: number, linked?: boolean }}
   */
  let { memory, threads, focus = '', depth = 0, linked = false } = $props();

  const replies = $derived(threads.children.get(memory.id) ?? []);
</script>

<MemoryCard {memory} focus={memory.id === focus} inThread {linked} index={depth} />

{#if replies.length === 1}
  <Self memory={replies[0]} {threads} {focus} {depth} linked />
{:else if replies.length > 1}
  <div
    class="flex flex-col gap-3 border-l-2 border-moss/40
      {depth < MAX_INDENT_DEPTH ? 'ml-3 pl-3 sm:ml-5 sm:pl-4' : 'pl-2'}"
    role="group"
    aria-label="{replies.length} replies"
  >
    {#each replies as reply (reply.id)}
      <Self memory={reply} {threads} {focus} depth={depth + 1} />
    {/each}
  </div>
{/if}
