// The color themes from the original 40 build. The colors themselves live in src/styles/theme.css,
// one [data-theme] block each; this only picks which block is active.
const STORAGE_KEY = 'forty.theme';

export const THEMES = [
  { id: 'matrix-beyond', name: 'Matrix Beyond' },
  { id: 'beyond', name: 'Batman Beyond' },
  { id: 'vaporwave', name: 'Vaporwave' },
  { id: 'monochrome', name: 'Monochrome CLI' },
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'gruvbox', name: 'Gruvbox' },
];

// Skins of the countdown clock ([data-clock] blocks in src/styles/theme.css).
export const CLOCK_SKINS = [
  { id: 'vintage', name: 'Vintage Split-Flap' },
  { id: 'crt', name: 'Retro CRT Terminal' },
  { id: 'cyber', name: 'Cyberpunk Hologram' },
  { id: 'pipboy', name: 'Fallout Pipboy' },
  { id: 'matrix', name: 'Matrix Stream' },
  { id: 'steampunk', name: 'Steampunk Brass' },
];

export const savedTheme = () => localStorage.getItem(STORAGE_KEY) || THEMES[0].id;

/** Switches the whole app to a theme and remembers it. @param {string} id */
export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  localStorage.setItem(STORAGE_KEY, theme.id);
  return theme.id;
}
