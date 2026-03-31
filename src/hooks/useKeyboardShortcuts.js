import { useEffect } from 'react';

/**
 * Register global keyboard shortcuts.
 * shortcuts: array of { key, ctrl, meta, shift, action, description }
 */
export function useKeyboardShortcuts(shortcuts, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : true;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && keyMatch) {
          // Don't fire inside inputs unless explicitly allowed
          const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
          if (inInput && !shortcut.allowInInput) continue;

          e.preventDefault();
          shortcut.action(e);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, deps);
}

// Predefined shortcut definitions (for display in help panel)
export const SHORTCUT_DEFS = [
  { key: 'S', ctrl: true, description: 'Save script' },
  { key: 'Enter', ctrl: true, description: 'Run script' },
  { key: 'K', ctrl: true, description: 'Clear output' },
  { key: ',', ctrl: true, description: 'Open settings' },
  { key: '/', ctrl: true, description: 'Toggle comment on line' },
  { key: 'H', ctrl: true, description: 'Toggle run history' },
];
