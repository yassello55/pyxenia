import React, { useState, useEffect, useRef } from 'react';
import {
  Package, Plus, Trash2, RefreshCw, Terminal,
  CheckCircle2, AlertCircle, Loader, X, FolderOpen
} from 'lucide-react';
import './EnvManager.css';

export default function EnvManager({ project, onClose }) {
  const [packageName, setPackageName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(null);
  const [log, setLog] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [pkgFilter, setPkgFilter] = useState('');
  const logRef = useRef(null);
  const api = window.pyxenia;

  useEffect(() => {
    loadInstalled();
    const handleOut = ({ data, type }) => setLog(prev => [...prev, { text: data, type }]);
    const handleDone = ({ code }) => {
      setInstalling(false);
      setUninstalling(null);
      const success = code === 0;
      setLog(prev => [...prev, {
        text: success ? '\n✅ Done!\n' : '\n❌ Failed.\n',
        type: success ? 'success' : 'error'
      }]);
      if (success) loadInstalled();
    };
    const unsubOut  = api.onInstallOutput(handleOut);
    const unsubDone = api.onInstallDone(handleDone);
    return () => { unsubOut(); unsubDone(); };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const loadInstalled = async () => {
    setLoadingList(true);
    const pkgs = await api.listPackages(project.id);
    setInstalled(pkgs || []);
    setLoadingList(false);
  };

  const handleInstall = async () => {
    const pkg = packageName.trim();
    if (!pkg || installing) return;
    setInstalling(true);
    setLog([{ text: `📦 Installing ${pkg}…\n`, type: 'info' }]);
    await api.installPackages({ projectId: project.id, packages: [pkg] });
    setPackageName('');
  };

  const handleUninstall = async (pkgName) => {
    setUninstalling(pkgName);
    setLog([{ text: `🗑 Uninstalling ${pkgName}…\n`, type: 'info' }]);
    await api.uninstallPackage({ projectId: project.id, packageName: pkgName });
  };

  const commonPackages = [
    { name: 'pandas', desc: 'Data analysis' },
    { name: 'numpy', desc: 'Numerical computing' },
    { name: 'requests', desc: 'HTTP requests' },
    { name: 'matplotlib', desc: 'Plotting & charts' },
    { name: 'openpyxl', desc: 'Excel files' },
    { name: 'pillow', desc: 'Image processing' },
    { name: 'beautifulsoup4', desc: 'Web scraping' },
    { name: 'scikit-learn', desc: 'Machine learning' },
  ];

  const filteredInstalled = installed.filter(p =>
    p.name.toLowerCase().includes(pkgFilter.toLowerCase())
  );

  return (
    <div className="env-overlay" onClick={onClose}>
      <div className="env-modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="env-modal-header">
          <div className="env-modal-title">
            <Package size={16} />
            <span>Package Manager</span>
            <span className="env-project-name">{project.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="icon-btn"
              onClick={() => api.openProjectFolder(project.id)}
              title="Open project folder"
            >
              <FolderOpen size={13} />
            </button>
            <button className="env-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="env-modal-body">

          {/* Install */}
          <div className="env-section">
            <div className="env-section-label">Install a package</div>
            <div className="install-row">
              <div className="install-input-wrap">
                <Terminal size={13} style={{ color: 'var(--text3)' }} />
                <input
                  className="install-input"
                  placeholder="e.g. pandas, requests, numpy==1.26"
                  value={packageName}
                  onChange={e => setPackageName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInstall()}
                  disabled={installing}
                  autoFocus
                />
              </div>
              <button
                className="install-btn"
                onClick={handleInstall}
                disabled={!packageName.trim() || installing || !project.envReady}
              >
                {installing
                  ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Installing</>
                  : <><Plus size={13} /> Install</>
                }
              </button>
            </div>
            {!project.envReady && (
              <div className="env-warn">
                <AlertCircle size={12} /> Python environment is still being set up…
              </div>
            )}
          </div>

          {/* Quick install */}
          <div className="env-section">
            <div className="env-section-label">Quick install</div>
            <div className="quick-grid">
              {commonPackages.map(p => (
                <button
                  key={p.name}
                  className="quick-pkg"
                  onClick={() => {
                    setPackageName(p.name);
                    setInstalling(true);
                    setLog([{ text: `📦 Installing ${p.name}…\n`, type: 'info' }]);
                    api.installPackages({ projectId: project.id, packages: [p.name] });
                  }}
                  disabled={installing || !project.envReady}
                  title={p.desc}
                >
                  <span className="quick-pkg-name">{p.name}</span>
                  <span className="quick-pkg-desc">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Installed packages */}
          <div className="env-section">
            <div className="env-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Installed ({installed.length})</span>
              <button className="icon-btn" onClick={loadInstalled} title="Refresh">
                <RefreshCw size={11} style={loadingList ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            </div>
            {installed.length > 0 && (
              <input
                className="install-input"
                style={{ marginBottom: 8, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius2)', padding: '5px 10px' }}
                placeholder="Filter packages…"
                value={pkgFilter}
                onChange={e => setPkgFilter(e.target.value)}
              />
            )}
            <div className="installed-list">
              {loadingList && (
                <div className="env-loading">
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
              )}
              {!loadingList && filteredInstalled.length === 0 && (
                <div className="env-loading" style={{ color: 'var(--text3)' }}>
                  {pkgFilter ? 'No matches' : 'No packages installed yet'}
                </div>
              )}
              {filteredInstalled.map(p => (
                <div className="installed-item" key={p.name}>
                  <span className="installed-name">{p.name}</span>
                  <span className="installed-version">{p.version}</span>
                  <button
                    className="uninstall-btn"
                    onClick={() => handleUninstall(p.name)}
                    disabled={!!uninstalling}
                    title={`Uninstall ${p.name}`}
                  >
                    {uninstalling === p.name
                      ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Trash2 size={11} />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div className="env-section">
              <div className="env-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Output</span>
                <button className="clear-log-btn" onClick={() => setLog([])}>Clear</button>
              </div>
              <div className="env-log" ref={logRef}>
                {log.map((l, i) => (
                  <span key={i} className={`env-log-line ${l.type}`}>{l.text}</span>
                ))}
              </div>
            </div>
          )}

          <div className="env-info">
            <CheckCircle2 size={12} /> Each project has an isolated <code>venv</code>. Packages installed here won't affect other projects.
          </div>
        </div>
      </div>
    </div>
  );
}
