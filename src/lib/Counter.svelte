<script>
	import Clock from "./Clock.svelte";

	let count = $state(0);
</script>

<button type="button" class="counter" onclick={() => count++}>Count is {count}</button>

<Clock />
