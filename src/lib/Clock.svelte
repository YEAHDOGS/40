<script>
	let hours = $state("00");
	let minutes = $state("00");
	let seconds = $state("00");
	let milliseconds = $state("000");
	let ampm = $state("AM");

	setInterval(() => {
		const now = new Date();

		// 12-Hour Format Conversion
		let currentHours = now.getHours();
		const currentAmPm = currentHours >= 12 ? "PM" : "AM";
		currentHours = currentHours % 12;
		currentHours = currentHours ? currentHours : 12; // The hour '0' should be '12'

		// Pad and update state
		hours = currentHours.toString().padStart(2, "0");
		minutes = now.getMinutes().toString().padStart(2, "0");
		seconds = now.getSeconds().toString().padStart(2, "0");
		milliseconds = now.getMilliseconds().toString().padStart(3, "0");
		ampm = currentAmPm;
	}, 10); // Updated to 10ms to capture milliseconds smoothly
</script>

<div>
	<span>{hours}</span>
	<span>:</span>
	<span>{minutes}</span>
	<span>:</span>
	<span>{seconds}</span>
	<span>.</span>
	<span>{milliseconds}</span>
	<span> </span>
	<span>{ampm}</span>
</div>

<style>
	div {
		display: flex;
		font-size: 3rem;
		font-family: "Courier New", Courier, monospace;
	}
</style>
