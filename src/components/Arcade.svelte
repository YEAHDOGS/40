<script>
	import { onMount } from "svelte";
	import { Trophy, ShieldAlert, Crosshair } from "lucide-svelte";

	let canvas;
	let ctx;
	let gameLoop;
	let score = $state(0);
	let highScore = $state(0);
	let isPlaying = $state(false);
	let gameOver = $state(false);

	const gridSize = 20;
	const tileCount = 20;
	let snake = [];
	let velocityX = 0;
	let velocityY = 0;
	let foodX = 15;
	let foodY = 15;

	// Pong State
	let activeGame = $state("SNAKE");
	let paddleLeft = { y: 150, score: 0 };
	let paddleRight = { y: 150, score: 0 };
	let ball = { x: 200, y: 200, vx: 5, vy: 5 };

	function initGame() {
		if (activeGame === "SNAKE") {
			snake = [
			{ x: 10, y: 10 },
			{ x: 9, y: 10 },
			{ x: 8, y: 10 },
		];
		velocityX = 1;
		velocityY = 0;
		score = 0;
		spawnFood();
		} else {
			paddleLeft.score = 0;
			paddleRight.score = 0;
			score = 0;
			resetBall();
		}
		isPlaying = true;
		gameOver = false;

		if (gameLoop) clearInterval(gameLoop);
		gameLoop = setInterval(update, activeGame === "SNAKE" ? 100 : 30);
	}

	function resetBall() {
		ball = { x: 200, y: 200, vx: (Math.random() > 0.5 ? 5 : -5), vy: (Math.random() > 0.5 ? 5 : -5) };
	}

	function spawnFood() {
		foodX = Math.floor(Math.random() * tileCount);
		foodY = Math.floor(Math.random() * tileCount);
	}

	function update() {
		if (activeGame === "SNAKE") {
			const headX = snake[0].x + velocityX;
			const headY = snake[0].y + velocityY;

			if (headX < 0 || headX >= tileCount || headY < 0 || headY >= tileCount) {
				endGame();
				return;
			}

			for (let i = 0; i < snake.length; i++) {
				if (snake[i].x === headX && snake[i].y === headY) {
					endGame();
					return;
				}
			}

			snake.unshift({ x: headX, y: headY });

			if (headX === foodX && headY === foodY) {
				score += 10;
				if (score > highScore) highScore = score;
				spawnFood();
			} else {
				snake.pop();
			}
		} else {
			// Pong Logic
			ball.x += ball.vx;
			ball.y += ball.vy;

			// Top/Bottom bounce
			if (ball.y <= 0 || ball.y >= 390) ball.vy *= -1;

			// Paddle collision
			if (ball.x <= 20 && ball.y >= paddleLeft.y && ball.y <= paddleLeft.y + 60) {
				ball.vx *= -1;
				ball.vx += 1;
			}
			if (ball.x >= 370 && ball.y >= paddleRight.y && ball.y <= paddleRight.y + 60) {
				ball.vx *= -1;
				ball.vx -= 1;
			}

			// Scoring
			if (ball.x < 0) {
				paddleRight.score += 10;
				resetBall();
			} else if (ball.x > 400) {
				paddleLeft.score += 10;
				score += 10;
				if (score > highScore) highScore = score;
				resetBall();
			}

			// Simple AI for right paddle
			if (paddleRight.y + 30 < ball.y) paddleRight.y += 4;
			if (paddleRight.y + 30 > ball.y) paddleRight.y -= 4;
		}

		draw();
	}

	function draw() {
		if (!ctx) return;
		
		ctx.fillStyle = "#0D0D12"; // base-bg
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (activeGame === "SNAKE") {
			// Grid
			ctx.strokeStyle = "rgba(0, 255, 157, 0.05)"; // accent-secondary faint
			for (let i = 0; i <= tileCount; i++) {
				ctx.beginPath();
				ctx.moveTo(i * gridSize, 0);
				ctx.lineTo(i * gridSize, canvas.height);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, i * gridSize);
				ctx.lineTo(canvas.width, i * gridSize);
				ctx.stroke();
			}

			// Food
			ctx.fillStyle = "#FF0055"; // accent-primary
			ctx.shadowBlur = 10;
			ctx.shadowColor = "#FF0055";
			ctx.fillRect(foodX * gridSize + 2, foodY * gridSize + 2, gridSize - 4, gridSize - 4);

			// Snake
			ctx.shadowBlur = 0;
			snake.forEach((part, index) => {
				if (index === 0) {
					ctx.fillStyle = "#FFFFFF"; // head
				} else {
					ctx.fillStyle = "#00FF9D"; // body accent-secondary
				}
				ctx.fillRect(part.x * gridSize + 1, part.y * gridSize + 1, gridSize - 2, gridSize - 2);
			});
		} else {
			// Center dash line
			ctx.strokeStyle = "rgba(255, 0, 85, 0.2)"; // accent-primary faint
			ctx.beginPath();
			ctx.setLineDash([10, 10]);
			ctx.moveTo(200, 0);
			ctx.lineTo(200, 400);
			ctx.stroke();
			ctx.setLineDash([]);

			// Paddles
			ctx.fillStyle = "#FF0055";
			ctx.shadowBlur = 10;
			ctx.shadowColor = "#FF0055";
			ctx.fillRect(10, paddleLeft.y, 10, 60);
			ctx.fillRect(380, paddleRight.y, 10, 60);

			// Ball
			ctx.fillStyle = "#FFFFFF";
			ctx.shadowBlur = 15;
			ctx.shadowColor = "#FFFFFF";
			ctx.fillRect(ball.x, ball.y, 10, 10);
			ctx.shadowBlur = 0;
		}
	}

	function endGame() {
		isPlaying = false;
		gameOver = true;
		clearInterval(gameLoop);
		
		// TODO: submit score to GraphQL
	}

	function handleKeydown(e) {
		if (!isPlaying) {
			if (e.key === " " || e.key === "Enter") initGame();
			return;
		}

		if (activeGame === "SNAKE") {
			switch (e.key) {
				case "ArrowUp":
				case "w":
					if (velocityY !== 1) { velocityX = 0; velocityY = -1; }
					break;
				case "ArrowDown":
				case "s":
					if (velocityY !== -1) { velocityX = 0; velocityY = 1; }
					break;
				case "ArrowLeft":
				case "a":
					if (velocityX !== 1) { velocityX = -1; velocityY = 0; }
					break;
				case "ArrowRight":
				case "d":
					if (velocityX !== -1) { velocityX = 1; velocityY = 0; }
					break;
			}
		} else {
			switch (e.key) {
				case "ArrowUp":
				case "w":
					if (paddleLeft.y > 0) paddleLeft.y -= 20;
					break;
				case "ArrowDown":
				case "s":
					if (paddleLeft.y < 340) paddleLeft.y += 20;
					break;
			}
		}
	}

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext("2d");
			draw(); // Draw initial empty board
		}
		
		window.addEventListener("keydown", handleKeydown);
		return () => {
			window.removeEventListener("keydown", handleKeydown);
			if (gameLoop) clearInterval(gameLoop);
		};
	});
</script>

<div class="max-w-4xl mx-auto pb-20">
	<div class="flex items-center justify-between mb-8 pb-4 border-b border-base-border">
		<h1 class="text-3xl font-bold font-mono text-accent-primary flex items-center">
			<Crosshair class="mr-3 w-8 h-8" />
			CYBER_SNAKE v1.0
		</h1>
		<div class="flex space-x-6">
			<div class="text-right">
				<p class="text-xs text-text-muted font-mono uppercase tracking-widest mb-1">Current Score</p>
				<p class="text-2xl font-bold text-accent-secondary font-mono">{score}</p>
			</div>
			<div class="text-right pl-6 border-l border-base-border">
				<p class="text-xs text-text-muted font-mono uppercase tracking-widest mb-1">High Score</p>
				<p class="text-2xl font-bold text-text-main font-mono">{highScore}</p>
			</div>
		</div>
	</div>

	<div class="flex flex-col lg:flex-row gap-8">
		<!-- Game Board -->
		<div class="relative inline-block border-2 border-accent-secondary/50 p-2 bg-base-darker shadow-[0_0_30px_rgba(0,255,157,0.1)] mx-auto lg:mx-0">
			<div class="flex space-x-4 mb-4 font-mono text-sm">
				<button 
					onclick={() => { activeGame = "SNAKE"; if(!isPlaying) draw(); }}
					class="px-4 py-2 border {activeGame === 'SNAKE' ? 'border-accent-secondary text-accent-secondary bg-accent-secondary/10' : 'border-base-border text-text-muted hover:text-text-main'}"
				>
					CYBER_SNAKE
				</button>
				<button 
					onclick={() => { activeGame = "PONG"; if(!isPlaying) draw(); }}
					class="px-4 py-2 border {activeGame === 'PONG' ? 'border-accent-primary text-accent-primary bg-accent-primary/10' : 'border-base-border text-text-muted hover:text-text-main'}"
				>
					NEON_PONG
				</button>
			</div>

			<canvas 
				bind:this={canvas} 
				width="400" 
				height="400" 
				class="bg-base-bg block"
			></canvas>

			{#if !isPlaying}
				<div class="absolute top-[3.2rem] bottom-0 left-0 right-0 bg-base-bg/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
					{#if gameOver}
						<ShieldAlert class="w-16 h-16 {activeGame === 'SNAKE' ? 'text-accent-secondary' : 'text-accent-primary'} mb-4" />
						<h2 class="text-3xl font-bold {activeGame === 'SNAKE' ? 'text-accent-secondary' : 'text-accent-primary'} font-mono mb-2 text-center">SYSTEM_FAILURE</h2>
						<p class="text-text-main mb-6 font-mono text-lg">Score: {score}</p>
					{:else}
						<Trophy class="w-16 h-16 {activeGame === 'SNAKE' ? 'text-accent-secondary' : 'text-accent-primary'} mb-4" />
						<h2 class="text-2xl font-bold text-text-main font-mono mb-6 text-center">READY_PLAYER_ONE</h2>
					{/if}
					
					<button 
						onclick={initGame}
						class="button-primary px-8 py-3 font-mono text-lg tracking-widest {activeGame === 'PONG' ? 'bg-accent-primary border-accent-primary shadow-[4px_4px_0px_0px_var(--theme-accent-primary)] hover:bg-transparent text-white' : ''}"
					>
						> {gameOver ? 'REBOOT_SEQUENCE' : 'INITIALIZE'}
					</button>
				</div>
			{/if}
		</div>

		<!-- Leaderboard Side -->
		<div class="flex-1 sharp-card p-6">
			<h3 class="text-xl font-bold text-accent-secondary font-mono mb-6 pb-2 border-b border-base-border flex items-center">
				<Trophy class="mr-2 w-5 h-5" />
				GLOBAL_RANKINGS
			</h3>
			
			<div class="space-y-4">
				<div class="flex justify-between items-center p-3 bg-base-darker border border-accent-secondary/20 relative overflow-hidden">
					<div class="absolute inset-0 bg-accent-secondary/5"></div>
					<div class="flex items-center space-x-4 relative z-10">
						<span class="text-accent-secondary font-bold font-mono text-lg w-6">1</span>
						<span class="text-text-main font-bold">@neo_matrix</span>
					</div>
					<span class="font-mono text-accent-secondary font-bold relative z-10">9,999</span>
				</div>
				<div class="flex justify-between items-center p-3 border border-base-border">
					<div class="flex items-center space-x-4">
						<span class="text-text-muted font-bold font-mono text-lg w-6">2</span>
						<span class="text-text-main">@trinity</span>
					</div>
					<span class="font-mono text-text-muted font-bold">8,450</span>
				</div>
				<div class="flex justify-between items-center p-3 border border-base-border">
					<div class="flex items-center space-x-4">
						<span class="text-text-muted font-bold font-mono text-lg w-6">3</span>
						<span class="text-text-main">@morpheus</span>
					</div>
					<span class="font-mono text-text-muted font-bold">7,210</span>
				</div>
				<div class="flex justify-between items-center p-3 border border-base-border opacity-70">
					<div class="flex items-center space-x-4">
						<span class="text-text-muted font-bold font-mono text-lg w-6">4</span>
						<span class="text-text-main">@cypher</span>
					</div>
					<span class="font-mono text-text-muted font-bold">1,020</span>
				</div>
			</div>
			
			<div class="mt-8 p-4 bg-accent-primary/5 border border-accent-primary/20">
				<p class="text-xs font-mono text-accent-primary leading-relaxed">
					> WARNING: Leaderboard resets during global wipe cycle.<br>
					> Connect external controller or use WASD/Arrows.
				</p>
			</div>
		</div>
	</div>
</div>
