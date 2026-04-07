import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Upload, FileCode2, Trash2, ChevronRight } from 'lucide-react';
import ScriptEditor from './ScriptEditor';
import './ProjectView.css';

export default function ProjectView({ project, onProjectUpdate, showChat, onToggleChat, onActiveScriptChange, onDebugWithAI, isLlmEditing }) {
  const [scripts, setScripts] = useState([]);
  const [activeScriptId, setActiveScriptId] = useState(null);
  const [scriptStatuses, setScriptStatuses] = useState({}); // { [scriptId]: 'idle'|'running'|'done'|'error' }

  const handleRunningChange = useCallback((scriptId, isRunning, exitCode) => {
    setScriptStatuses(prev => ({
      ...prev,
      [scriptId]: isRunning ? 'running' : exitCode === null ? 'idle' : exitCode === 0 ? 'done' : 'error',
    }));
  }, []);

  const anyRunning = Object.values(scriptStatuses).some(s => s === 'running');

  // Persists output/files/history across script switches without re-rendering ProjectView
  const scriptCacheRef = useRef({});

  const [showNewScript, setShowNewScript] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const api = window.pyxenia;

  // Global script event listeners — update statuses even when the ScriptEditor is not mounted
  useEffect(() => {
    const unsubDone = api.onScriptDone(({ scriptId, code }) => {
      setScriptStatuses(prev => {
        if (prev[scriptId] !== 'running') return prev;
        return { ...prev, [scriptId]: code === 0 ? 'done' : 'error' };
      });
    });
    return () => unsubDone();
  }, []);

  // ✅ Fix: re-sync scripts whenever project changes (fixes disappearing scripts bug)
  useEffect(() => {
    // Always reload from disk when project switches
    api.getProjects().then(data => {
      const projects = data.projects || data;
      const fresh = projects.find(p => p.id === project.id);
      const loaded = (fresh ? fresh.scripts : project.scripts) || [];
      setScripts(loaded);
      setActiveScriptId(loaded.length > 0 ? loaded[0].id : null);
    });
    setShowNewScript(false);
  }, [project.id]);

  const activeScript = scripts.find(s => s.id === activeScriptId);
  const [activeScriptCode, setActiveScriptCode] = useState('');

  // Notify parent when active script changes so ChatPanel gets context
  useEffect(() => {
    setActiveScriptCode(''); // reset until ScriptEditor loads the code
    onActiveScriptChange?.({ script: activeScript || null, project, code: '' });
  }, [activeScriptId]);

  const handleScriptCodeLoad = (code) => {
    setActiveScriptCode(code);
    onActiveScriptChange?.({ script: activeScript || null, project, code, scriptArgs: [] });
  };

  const handleScriptArgsChange = (scriptArgs) => {
    onActiveScriptChange?.({ script: activeScript || null, project, code: activeScriptCode, scriptArgs });
  };

  const handleNewScript = async () => {
    if (!newName.trim()) return;
    const saved = await api.saveScript({
      projectId: project.id,
      name: newName.trim(),
      code: `# ${newName.trim()}\n# Paste or write your Python code here\n\nprint("Hello from Pyxenia!")\n`,
    });
    if (saved) {
      const updated = [...scripts, saved];
      setScripts(updated);
      setActiveScriptId(saved.id);
      setShowNewScript(false);
      setNewName('');
      // Also push update to parent so it's reflected in projects.json
      onProjectUpdate({ ...project, scripts: updated });
    }
  };

  const handleImport = async () => {
    const result = await api.importScript(project.id);
    if (!result) return;
    const saved = await api.saveScript({ projectId: project.id, name: result.name, code: result.code });
    if (saved) {
      const updated = [...scripts, saved];
      setScripts(updated);
      setActiveScriptId(saved.id);
      onProjectUpdate({ ...project, scripts: updated });
    }
  };

  const handleDeleteScript = async (scriptId) => {
    await api.deleteScript({ projectId: project.id, scriptId });
    const updated = scripts.filter(s => s.id !== scriptId);
    setScripts(updated);
    if (activeScriptId === scriptId) setActiveScriptId(null);
    onProjectUpdate({ ...project, scripts: updated });
  };

  const handleRenameScript = async (scriptId) => {
    const script = scripts.find(s => s.id === scriptId);
    if (!renameValue.trim() || renameValue.trim() === script?.name) { setRenamingId(null); return; }
    const updated = await api.renameScript({ projectId: project.id, scriptId, name: renameValue.trim() });
    if (updated) {
      const updatedScripts = scripts.map(s => s.id === scriptId ? { ...s, name: updated.name } : s);
      setScripts(updatedScripts);
      onProjectUpdate({ ...project, scripts: updatedScripts });
    }
    setRenamingId(null);
  };

  const handleScriptSave = (updatedScript) => {
    setScripts(prev => prev.map(s => s.id === updatedScript.id ? updatedScript : s));
  };

  return (
    <div className="project-view">
      {/* Top bar */}
      <div className="project-topbar">
        <div className="project-topbar-left">
          <div className="project-name">{project.name}</div>
          {project.description && <div className="project-desc">{project.description}</div>}
        </div>
        <div className="project-topbar-right">
          {project.envError ? (
            <div className="env-status error">
              <span className="dot" />
              <span className="env-error-msg" title={project.envError}>Python env failed</span>
              <button className="retry-btn" onClick={async () => {
                await api.retryEnv(project.id);
                onProjectUpdate({ ...project, envReady: false, envError: null, envStatus: 'Retrying…' });
              }}>Retry Setup</button>
            </div>
          ) : !project.envReady ? (
            <div className="env-status building">
              <span className="dot" />
              {project.envStatus || 'Setting up Python environment…'}
            </div>
          ) : (
            <div className="env-status ready">
              <span className="dot" />Python env ready
            </div>
          )}
        </div>
      </div>

      <div className="project-body">
        {/* Script list panel */}
        <div className="script-panel">
          <div className="script-panel-header">
            <span>Scripts</span>
            <div className="script-panel-actions">
              <button className="icon-btn" onClick={handleImport} title="Import .py file"><Upload size={13} /></button>
              <button className="icon-btn accent" onClick={() => setShowNewScript(true)} title="New script"><Plus size={13} /></button>
            </div>
          </div>

          {showNewScript && (
            <div className="new-script-form fade-in">
              <input
                className="script-name-input"
                placeholder="Script name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleNewScript();
                  if (e.key === 'Escape') setShowNewScript(false);
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-xs-primary" onClick={handleNewScript}>Add</button>
                <button className="btn-xs-ghost" onClick={() => setShowNewScript(false)}>✕</button>
              </div>
            </div>
          )}

          <div className="script-list">
            {scripts.length === 0 && !showNewScript && (
              <div className="no-scripts">
                <FileCode2 size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
                <div>No scripts yet.</div>
                <div>Create one or import a .py file.</div>
              </div>
            )}
            {scripts.map(s => {
              const status = scriptStatuses[s.id];
              return (
              <div
                key={s.id}
                className={`script-item ${s.id === activeScriptId ? 'active' : ''}`}
                onClick={() => setActiveScriptId(s.id)}
              >
                <FileCode2 size={13} style={{ flexShrink: 0, color: s.id === activeScriptId ? 'var(--accent)' : 'var(--text3)' }} />
                {status && status !== 'idle' && (
                  <span className={`script-status-dot ${status}`} title={status === 'running' ? 'Running…' : status === 'done' ? 'Completed' : 'Failed'} />
                )}
                {renamingId === s.id ? (
                  <input
                    className="script-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameScript(s.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameScript(s.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className="script-item-name"
                    onDoubleClick={e => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.name); }}
                  >{s.name}</span>
                )}
                {s.id === activeScriptId && renamingId !== s.id && <ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
                <button
                  className="script-delete-btn"
                  onClick={e => { e.stopPropagation(); handleDeleteScript(s.id); }}
                  title="Delete script"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              );
            })}
          </div>
        </div>

        {/* Editor area */}
        <div className="editor-area">
          {activeScript ? (
            <ScriptEditor
              key={activeScript.id}
              script={activeScript}
              project={project}
              onSave={handleScriptSave}
              showChat={showChat}
              onToggleChat={onToggleChat}
              onDebugWithAI={(summary) => onDebugWithAI?.(summary, activeScript, project)}
              onCodeLoad={handleScriptCodeLoad}
              isRunning={scriptStatuses[activeScript.id] === 'running'}
              onRunningChange={(isRunning, exitCode) => handleRunningChange(activeScript.id, isRunning, exitCode)}
              projectHasRunningScript={anyRunning}
              initialCache={scriptCacheRef.current[activeScript.id] || null}
              onCacheUpdate={data => { scriptCacheRef.current[activeScript.id] = data; }}
              isLlmEditing={isLlmEditing}
              onScriptArgsChange={handleScriptArgsChange}
            />
          ) : (
            <div className="no-script-selected">
              <FileCode2 size={36} style={{ color: 'var(--text3)', marginBottom: 12 }} />
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>Select a script to edit and run</div>
              <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6 }}>or create a new one from the panel on the left</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
