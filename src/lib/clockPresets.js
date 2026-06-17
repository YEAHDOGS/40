// Predefined presets for the countdown clock theme
export const presets = [
	{
		id: "vintage",
		name: "Vintage Split-Flap (Default)",
		colorBg: "#1c1c1c",
		colorTile: "#e4e4e4",
		colorDigit: "#1a1a1a",
		colorLabel: "#ff6600",
		css: ""
	},
	{
		id: "crt",
		name: "Retro CRT Terminal",
		colorBg: "#050f05",
		colorTile: "#0a1c0a",
		colorDigit: "#33ff33",
		colorLabel: "#33ff33",
		css: "/* CRT Scanlines Override */\n.flip-card {\n  border: 1px solid #33ff33;\n  box-shadow: 0 0 10px rgba(51,255,51,0.2);\n  border-radius: 4px;\n}\n.flip-digit {\n  font-family: 'Courier New', monospace !important;\n  text-shadow: 0 0 5px #33ff33;\n}"
	},
	{
		id: "cyber",
		name: "Cyberpunk Hologram",
		colorBg: "#120024",
		colorTile: "#1d003a",
		colorDigit: "#00f0ff",
		colorLabel: "#ff007f",
		css: "/* Cyberpunk glowing borders */\n.timer-wrapper {\n  border: 2px solid #ff007f !important;\n  box-shadow: 0 0 20px rgba(255,0,127,0.4);\n}\n.flip-card {\n  border: 1px solid #00f0ff;\n}\n.flip-digit {\n  text-shadow: 0 0 8px #00f0ff;\n}"
	},
	{
		id: "minimal",
		name: "Minimalist Glass",
		colorBg: "rgba(255,255,255,0.03)",
		colorTile: "rgba(255,255,255,0.07)",
		colorDigit: "#ffffff",
		colorLabel: "#999999",
		css: "/* Glassmorphic border blur */\n.timer-wrapper {\n  backdrop-filter: blur(12px);\n  border: 1px solid rgba(255,255,255,0.1) !important;\n}\n.flip-card::after {\n  display: none; /* Hide split line */\n}"
	}
];

// Community custom designs
export const communityThemes = [
	{
		id: "pipboy",
		name: "Fallout Pipboy",
		colorBg: "#0d1b0d",
		colorTile: "#1a331a",
		colorDigit: "#ffb000",
		colorLabel: "#ffb000",
		css: ".flip-card { border: 1.5px solid #ffb000; }\n.flip-digit { font-family: monospace; }"
	},
	{
		id: "matrix",
		name: "Matrix Stream",
		colorBg: "#000000",
		colorTile: "#001100",
		colorDigit: "#00ff00",
		colorLabel: "#00aa00",
		css: ".flip-digit { font-family: 'Courier New', monospace; animation: matrix-glow 2s infinite alternate; }\n@keyframes matrix-glow {\n  from { text-shadow: 0 0 4px #00ff00; }\n  to { text-shadow: 0 0 12px #00ff00; }\n}"
	},
	{
		id: "steampunk",
		name: "Steampunk Brass",
		colorBg: "#2b1810",
		colorTile: "#b58a30",
		colorDigit: "#3d2510",
		colorLabel: "#d4af37",
		css: ".flip-card {\n  border: 2px solid #8c6221;\n  border-radius: 4px;\n}\n.flip-digit {\n  font-family: 'Georgia', serif;\n}"
	}
];
