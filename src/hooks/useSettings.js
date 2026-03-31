import { useState, useEffect } from 'react';

const DEFAULTS = {
  fontSize: 13,
  lineHeight: 1.65,
  tabSize: 4,
  outputLines: 1000,
  autosave: true,
  syntaxHighlight: true,
  confirmDelete: true,
  pythonPath: '',
  theme: 'dark',
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('pyxenia-settings');
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  const updateSettings = (next) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    try { localStorage.setItem('pyxenia-settings', JSON.stringify(merged)); } catch {}
  };

  // Apply CSS variables + theme whenever settings change
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme || 'dark');
    root.style.setProperty('--editor-font-size',   `${settings.fontSize}px`);
    root.style.setProperty('--editor-line-height', `${settings.lineHeight}`);
    root.style.setProperty('--editor-tab-size',    `${settings.tabSize}`);
  }, [settings.theme, settings.fontSize, settings.lineHeight, settings.tabSize]);

  return { settings, updateSettings };
}
