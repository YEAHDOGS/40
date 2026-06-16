const isBrowser = typeof window !== 'undefined';

export const themes = [
  {
    id: 'matrix-beyond',
    name: 'Matrix Beyond',
    colors: {
      '--theme-bg': '#000000',
      '--theme-surface': '#0a0a0a',
      '--theme-border': '#1a1a1a',
      '--theme-accent-primary': '#ff003c',
      '--theme-accent-secondary': '#00ff41',
      '--theme-text-main': '#f0f0f0',
      '--theme-text-muted': '#666666'
    }
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    colors: {
      '--theme-bg': '#190028',
      '--theme-surface': '#260040',
      '--theme-border': '#4b0082',
      '--theme-accent-primary': '#ff00c8',
      '--theme-accent-secondary': '#00ffff',
      '--theme-text-main': '#e0e0e0',
      '--theme-text-muted': '#a080d0'
    }
  },
  {
    id: 'monochrome',
    name: 'Monochrome CLI',
    colors: {
      '--theme-bg': '#000000',
      '--theme-surface': '#000000',
      '--theme-border': '#333333',
      '--theme-accent-primary': '#ffffff',
      '--theme-accent-secondary': '#aaaaaa',
      '--theme-text-main': '#ffffff',
      '--theme-text-muted': '#555555'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    colors: {
      '--theme-bg': '#1a1b26',
      '--theme-surface': '#24283b',
      '--theme-border': '#414868',
      '--theme-accent-primary': '#f7768e',
      '--theme-accent-secondary': '#73daca',
      '--theme-text-main': '#c0caf5',
      '--theme-text-muted': '#565f89'
    }
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    colors: {
      '--theme-bg': '#282828',
      '--theme-surface': '#3c3836',
      '--theme-border': '#504945',
      '--theme-accent-primary': '#fe8019',
      '--theme-accent-secondary': '#b8bb26',
      '--theme-text-main': '#ebdbb2',
      '--theme-text-muted': '#a89984'
    }
  }
];

export function applyTheme(themeId) {
  if (!isBrowser) return;
  const theme = themes.find(t => t.id === themeId) || themes[0];
  const root = document.documentElement;
  
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value);
  }
  
  localStorage.setItem('40forty-theme', themeId);
}

export function initTheme() {
  if (!isBrowser) return;
  const savedTheme = localStorage.getItem('40forty-theme') || 'matrix-beyond';
  applyTheme(savedTheme);
}
