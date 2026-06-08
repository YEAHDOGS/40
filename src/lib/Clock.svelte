<script>
	let days = $state(0);
	let hours = $state(0);
	let minutes = $state(0);
	let seconds = $state(0);

	setInterval(() => {
		const now = new Date();
		days = now.getDate();
		hours = now.getHours();
		minutes = now.getMinutes();
		seconds = now.getSeconds();
	}, 1000);
</script>

<div>
	<span>{days.toString().padStart(2, "0")}</span>
	<span>:</span>
	<span>{hours.toString().padStart(2, "0")}</span>
	<span>:</span>
	<span>{minutes.toString().padStart(2, "0")}</span>
	<span>:</span>
	<span>{seconds.toString().padStart(2, "0")}</span>
	<span>:</span>
	<span>{seconds.toString().padStart(2, "0")}</span>
</div>

<style>
	div {
		display: flex;
		font-size: 3rem;
		font-family: "Courier New", Courier, monospace;
	}
</style>
