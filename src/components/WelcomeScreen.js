import React, { useState, useEffect } from 'react';
import { FolderPlus, Code2, Play, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import AcornIcon from './AcornIcon';
import './WelcomeScreen.css';

export default function WelcomeScreen({ onCreateProject }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [pythonStatus, setPythonStatus] = useState(null); // null=checking, {found, version, pythonExe}

  useEffect(() => {
    window.pyxenia.checkPython().then(setPythonStatus);
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreateProject(name.trim(), desc.trim());
    setName(''); setDesc(''); setShowForm(false);
  };

  return (
    <div className="welcome">
      <div className="welcome-inner fade-in">
        <div className="welcome-icon"><AcornIcon size={32} /></div>
        <h1 className="welcome-title">Pyxenia</h1>
        <p className="welcome-sub">Run Python scripts without touching a terminal.<br />Paste code. Click run. See results.</p>

        <div className="feature-grid">
          {[
            { icon: <FolderPlus size={18}/>, title: 'Isolated Projects', desc: 'Each project gets its own Python environment.' },
            { icon: <Code2 size={18}/>, title: 'Paste or Import', desc: 'Drop in code from an LLM, tutorial, or file.' },
            { icon: <Package size={18}/>, title: 'Auto Dependencies', desc: 'Detect and install packages with one click.' },
            { icon: <Play size={18}/>, title: 'One-Click Run', desc: 'See live output in a built-in console.' },
          ].map((f, i) => (
            <div className="feature-card" key={i} style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="feature-icon">{f.icon}</div>
              <div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Python status */}
        {pythonStatus === null && (
          <div className="python-status checking">Checking Python installation…</div>
        )}
        {pythonStatus && pythonStatus.found && (
          <div className="python-status ok">
            <CheckCircle2 size={13}/> {pythonStatus.version} detected — ready to go!
          </div>
        )}
        {pythonStatus && !pythonStatus.found && (
          <div className="python-status error">
            <AlertTriangle size={13}/>
            <div>
              <strong>Python not found.</strong> Pyxenia needs Python 3 installed on your computer.
              <br/>
              <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="python-link">
                Download Python 3 → python.org
              </a>
              <br/>
              <span style={{ fontSize: 11, opacity: 0.7 }}>After installing, restart Pyxenia.</span>
            </div>
          </div>
        )}

        {showForm ? (
          <div className="welcome-form fade-in">
            <input
              className="form-input-lg"
              placeholder="Project name (e.g. CSV Analyzer)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <input
              className="form-input-lg"
              placeholder="What does this project do? (optional)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-create" onClick={handleCreate} disabled={!name.trim()}>Create Project</button>
              <button className="btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-start" onClick={() => setShowForm(true)}>
            <FolderPlus size={16} /> Create your first project
          </button>
        )}
      </div>
    </div>
  );
}
