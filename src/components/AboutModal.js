import React from 'react';
import { X, Github, Heart, Keyboard } from 'lucide-react';
import AcornIcon from './AcornIcon';
import { SHORTCUT_DEFS } from '../hooks/useKeyboardShortcuts';
import './AboutModal.css';

export default function AboutModal({ onClose }) {
  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-modal fade-in" onClick={e => e.stopPropagation()}>
        <button className="about-close" onClick={onClose}><X size={15} /></button>

        <div className="about-hero">
          <div className="about-logo"><AcornIcon size={28} /></div>
          <div className="about-name">Pyxenia</div>
          <div className="about-version">Version 0.1.0 — MVP</div>
          <p className="about-tagline">
            Run Python scripts without touching a terminal.<br />
            Built for everyone who gets code from an LLM and just wants to <em>use it</em>.
          </p>
        </div>

        <div className="about-section">
          <div className="about-section-title"><Keyboard size={13} /> Keyboard Shortcuts</div>
          <div className="shortcuts-grid">
            {SHORTCUT_DEFS.map((s, i) => (
              <div className="shortcut-row" key={i}>
                <div className="shortcut-keys">
                  <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd>
                  {s.shift && <><span>+</span><kbd>Shift</kbd></>}
                  <span>+</span>
                  <kbd>{s.key}</kbd>
                </div>
                <div className="shortcut-desc">{s.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="about-section">
          <div className="about-section-title"><Github size={13} /> Open Source</div>
          <p className="about-text">
            Pyxenia is free and open source under the MIT license.
            Contributions, bug reports, and feature requests are welcome on GitHub.
          </p>
          <a
            className="about-link"
            href="https://github.com/your-username/pyxenia"
            target="_blank"
            rel="noreferrer"
          >
            github.com/your-username/pyxenia →
          </a>
        </div>

        <div className="about-footer">
          <Heart size={12} /> Made for non-coders who got a Python script and had no idea what to do with it.
        </div>
      </div>
    </div>
  );
}
