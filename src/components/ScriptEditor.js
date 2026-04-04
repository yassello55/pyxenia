import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  Play, Square, Save, Package, FileInput, FolderOutput, History,
  CheckCircle2, Loader, Search, Info, FolderOpen, Download, Terminal, Files, Eye, MessageSquare, Bug
} from 'lucide-react';
import EnvManager from './EnvManager';
import RunHistory from './RunHistory';
import HighlightedEditor from './HighlightedEditor';
import OutputConsole from './OutputConsole';
import FilePreview from './FilePreview';
import { SettingsContext } from '../App';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import './ScriptEditor.css';

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── Smart error summarizer ───────────────────────────────────────────────────
function summarizeConsoleErrors(output) {
  const text = output.map(o => o.data).join('');
  const lines = text.split('\n');

  // Find the last Traceback block
  let lastTbIdx = -1;
  lines.forEach((l, i) => { if (l.includes('Traceback (most recent call last)')) lastTbIdx = i; });

  let errorBlock;
  if (lastTbIdx >= 0) {
    const tbLines = lines.slice(lastTbIdx);
    if (tbLines.length > 18) {
      // Keep first 3 lines + last 6 (the actual error) to stay compact
      errorBlock = [
        ...tbLines.slice(0, 3),
        `  … (${tbLines.length - 9} lines omitted) …`,
        ...tbLines.slice(-6),
      ].join('\n');
    } else {
      errorBlock = tbLines.join('\n');
    }
  } else {
    // No traceback — just take the last 15 stderr lines
    const errLines = output.filter(o => o.type === 'stderr').map(o => o.data).join('').split('\n').filter(Boolean);
    errorBlock = errLines.slice(-15).join('\n');
  }

  return errorBlock.trim();
}

export default function ScriptEditor({ script, project, onSave, showChat, onToggleChat, onDebugWithAI, onCodeLoad, onRunningChange, projectHasRunningScript, isRunning: initialRunning, initialCache, onCacheUpdate, isLlmEditing }) {
  const { settings } = useContext(SettingsContext);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState(initialCache?.output || []);
  const [running, setRunning] = useState(initialRunning || false);
  const [saved, setSaved] = useState(true);
  const [inputFile, setInputFile] = useState(null);
  const [showInputWarning, setShowInputWarning] = useState(false);
  const [showOutputWarning, setShowOutputWarning] = useState(false);

  // Install panel
  const [detectedPkgs, setDetectedPkgs] = useState([]);
  const [missingPkgs, setMissingPkgs] = useState([]);
  const [installedPkgs, setInstalledPkgs] = useState([]);
  const [installingPkg, setInstallingPkg] = useState(null); // pkg name | 'all' | null
  const [installLog, setInstallLog] = useState([]);
  const [showInstallPanel, setShowInstallPanel] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const [showEnvManager, setShowEnvManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runHistory, setRunHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(`pyxenia-run-history-${script.id}`);
      return stored ? JSON.parse(stored) : (initialCache?.runHistory || []);
    } catch { return initialCache?.runHistory || []; }
  });
  const [draggingOver, setDraggingOver] = useState(false);
  const [outputTab, setOutputTab] = useState('console');
  const [scriptFiles, setScriptFiles] = useState(initialCache?.scriptFiles || []);
  const [previewFile, setPreviewFile] = useState(null);
  const [showMissingDepsWarning, setShowMissingDepsWarning] = useState(false);
  const [missingDepNames, setMissingDepNames] = useState([]);
  const [lastExitCode, setLastExitCode] = useState(initialCache?.lastExitCode ?? null);

  // Find bar
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const findInputRef = useRef(null);

  // Refs to always hold latest values for cache-on-unmount (avoids stale closure)
  const outputRef      = useRef(output);
  const scriptFilesRef = useRef(scriptFiles);
  const lastExitCodeRef= useRef(lastExitCode);
  const runHistoryRef  = useRef(runHistory);
  useEffect(() => { outputRef.current      = output;      }, [output]);
  useEffect(() => { scriptFilesRef.current = scriptFiles; }, [scriptFiles]);
  useEffect(() => { lastExitCodeRef.current= lastExitCode;}, [lastExitCode]);
  useEffect(() => { runHistoryRef.current  = runHistory;  }, [runHistory]);

  // Save state to parent cache when unmounting so it survives script switches
  useEffect(() => {
    return () => {
      onCacheUpdate?.({
        output:      outputRef.current,
        scriptFiles: scriptFilesRef.current,
        lastExitCode:lastExitCodeRef.current,
        runHistory:  runHistoryRef.current,
      });
    };
  }, []);

  // ── Resizable split ────────────────────────────────────────────────────────
  const [editorHeightPct, setEditorHeightPct] = useState(60); // % of available height
  const isDraggingDivider = useRef(false);
  const splitContainerRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const syncLineNumberScroll = useCallback((scrollTop) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
  }, []);

  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    isDraggingDivider.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev) => {
      if (!isDraggingDivider.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorHeightPct(Math.min(85, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      isDraggingDivider.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const currentOutputRef = useRef([]);
  const api = window.pyxenia;

  // Persist run history to localStorage on every change (survives project switches)
  useEffect(() => {
    try {
      // Cap at 30 runs, trim each output to 300 lines to stay within storage limits
      const capped = runHistory.slice(-30).map(r => ({
        ...r,
        output: r.output?.slice(-300),
      }));
      localStorage.setItem(`pyxenia-run-history-${script.id}`, JSON.stringify(capped));
    } catch {}
  }, [runHistory]);

  // Load output files from disk on mount so they survive project switches
  useEffect(() => {
    api.listScriptFiles({ projectId: project.id, scriptId: script.id }).then(files => {
      if (files?.length) setScriptFiles(files);
    });
  }, [script.id]);

  // Load code
  useEffect(() => {
    api.readScript(script.filePath).then(c => {
      const loaded = c || '';
      setCode(loaded);
      onCodeLoad?.(loaded);
    });
  }, [script.id]);

  // Reload code from disk when LLM finishes editing (isLlmEditing: true → false)
  const prevLlmEditing = useRef(false);
  useEffect(() => {
    if (prevLlmEditing.current && !isLlmEditing) {
      api.readScript(script.filePath).then(c => {
        const loaded = c || '';
        setCode(loaded);
        setSaved(true);
        onCodeLoad?.(loaded);
      });
    }
    prevLlmEditing.current = !!isLlmEditing;
  }, [isLlmEditing]);

  // Script run events
  useEffect(() => {
    const handleOutput = ({ scriptId, data, type }) => {
      if (scriptId !== script.id) return;
      currentOutputRef.current.push({ text: data, type });
      setOutput(prev => [...prev, { text: data, type }]);
    };
    const handleDone = ({ scriptId, code: exitCode }) => {
      if (scriptId !== script.id) return;
      setRunning(false);
      onRunningChange?.(false, exitCode);
      setLastExitCode(exitCode);
      const exitLine = {
        text: `\n─── Exited with code ${exitCode} ───\n`,
        type: exitCode === 0 ? 'info' : 'stderr'
      };
      setOutput(prev => [...prev, exitLine]);
      const allOutput = currentOutputRef.current.map(l => l.text).join('');
      const preview = allOutput.trim().split('\n')[0]?.slice(0, 80) || '';
      setRunHistory(prev => [...prev, {
        timestamp: new Date().toISOString(),
        exitCode,
        outputPreview: preview,
        output: [...currentOutputRef.current, exitLine],
      }]);
      // Detect missing dependencies from all output (not just on error exit —
      // scripts may catch exceptions internally and still exit with code 0)
      const allText = currentOutputRef.current.map(l => l.text).join('');
      const missing = new Set();
      // ModuleNotFoundError / ImportError: No module named 'xxx'
      for (const m of allText.matchAll(/(?:ModuleNotFoundError|ImportError)[^\n]*'([^']+)'/g))
        missing.add(m[1].split('.')[0]);
      // BeautifulSoup FeatureNotFound: features you requested: lxml
      for (const m of allText.matchAll(/features you requested:\s*([\w][\w-]*)/g))
        missing.add(m[1]);
      // pkg_resources.DistributionNotFound: The 'xxx' distribution was not found
      for (const m of allText.matchAll(/DistributionNotFound[^\n]*'([^']+)'/g))
        missing.add(m[1].split('.')[0]);
      if (missing.size > 0) {
        setMissingDepNames([...missing]);
        setShowMissingDepsWarning(true);
      }
      currentOutputRef.current = [];
      api.listScriptFiles({ projectId: project.id, scriptId: script.id }).then(setScriptFiles);
    };
    const unsubOutput = api.onScriptOutput(handleOutput);
    const unsubDone   = api.onScriptDone(handleDone);
    return () => { unsubOutput(); unsubDone(); };
  }, [script.id]);

  // ✅ Fix: install events in their own effect with a stable ref-based handler
  // Using refs means the callback always sees fresh state without stale closures
  const installingPkgRef = useRef(null);
  useEffect(() => { installingPkgRef.current = installingPkg; }, [installingPkg]);

  useEffect(() => {
    const handleInstallOutput = ({ data, type }) => {
      setInstallLog(prev => [...prev, { text: data, type }]);
    };

    const handleInstallDone = ({ code: exitCode }) => {
      // Clear spinner immediately
      setInstallingPkg(null);
      installingPkgRef.current = null;

      setInstallLog(prev => [...prev, {
        text: exitCode === 0 ? '\n✅ Done!\n' : '\n❌ Failed.\n',
        type: exitCode === 0 ? 'info' : 'stderr'
      }]);

      // ✅ Refresh installed list synchronously so UI updates in same pass
      if (exitCode === 0) {
        window.pyxenia.listPackages(project.id).then(list => {
          const names = new Set((list || []).map(p => p.name.toLowerCase()));
          setInstalledPkgs([...names]);
          setMissingPkgs(prev => prev.filter(p => !names.has(p.toLowerCase())));
        });
      }
    };

    const unsubOut  = api.onInstallOutput(handleInstallOutput);
    const unsubDone = api.onInstallDone(handleInstallDone);
    return () => { unsubOut(); unsubDone(); };
  }, [project.id]); // re-register if project changes

  const handleCodeChange = (e) => { setCode(e.target.value); setSaved(false); };

  const handleSave = useCallback(async () => {
    const updated = await api.saveScript({
      projectId: project.id,
      scriptId: script.id,
      name: script.name,
      code,
    });
    if (updated) { setSaved(true); onSave(updated); }
  }, [code, script.id, project.id]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const doRun = async (inputFileOverride) => {
    await handleSave();
    setOutput([]);
    currentOutputRef.current = [];
    setLastExitCode(null);
    setRunning(true);
    onRunningChange?.(true, null);
    setShowHistory(false);
    await api.runScript({ projectId: project.id, scriptId: script.id, inputFile: inputFileOverride ?? inputFile });
  };

  // Step 2: check input file, then run
  const proceedToInputCheck = () => {
    const needsFile = /sys\.argv\s*\[/.test(code);
    if (needsFile && !inputFile) {
      setShowInputWarning(true);
    } else {
      doRun();
    }
  };

  // Step 1: check if output files will be saved outside the app folder
  const handleRun = () => {
    // Risky: input file's *directory* is used as the output location
    // Safe: only the *basename* (filename) is extracted from input_file — directory is not preserved
    const riskyOutput = (
      // dirname(input_file) — explicitly saves to input file's directory
      /os\.path\.dirname\s*\(.*(?:input_file|sys\.argv)/.test(code) ||
      // splitext applied directly to input path (not wrapped in basename) — full path including dir
      /os\.path\.splitext\s*\(\s*(?:input_file|sys\.argv\s*\[\s*1\s*\])/.test(code) ||
      // direct string ops on input_file that preserve the path (slice, replace, rsplit on the full path)
      /(?:input_file|sys\.argv\s*\[\s*1\s*\])\s*(?:\[:-?\d+\]|\.replace\s*\(|\.rsplit\s*\()/.test(code)
    );
    if (riskyOutput) {
      setShowOutputWarning(true);
    } else {
      proceedToInputCheck();
    }
  };

  const handleStop = () => { api.stopScript(script.id); setRunning(false); onRunningChange?.(false, null); };

  const handlePickInput = async () => {
    const p = await api.pickInputFile();
    if (p) setInputFile(p);
  };

  const handleDetect = async () => {
    setDetecting(true);
    setShowInstallPanel(true);
    setInstallLog([]);
    const [detected, installed] = await Promise.all([
      api.detectImports(code),
      api.listPackages(project.id),
    ]);
    const installedNames = new Set((installed || []).map(p => p.name.toLowerCase()));
    setInstalledPkgs([...installedNames]);
    setDetectedPkgs(detected);
    setMissingPkgs(detected.filter(p => !installedNames.has(p.toLowerCase())));
    setDetecting(false);
  };

  const handleInstallOne = async (pkg) => {
    setInstallingPkg(pkg);
    setInstallLog([]);
    await api.installPackages({ projectId: project.id, packages: [pkg] });
  };

  const handleInstallAll = async () => {
    if (!missingPkgs.length) return;
    setInstallingPkg('all');
    setInstallLog([]);
    await api.installPackages({ projectId: project.id, packages: missingPkgs });
  };

  useKeyboardShortcuts([
    { key: 'Enter', ctrl: true, action: () => { if (!running && project.envReady) handleRun(); }, allowInInput: true },
    { key: 'k',     ctrl: true, action: () => setOutput([]),                                       allowInInput: false },
    { key: 'h',     ctrl: true, action: () => setShowHistory(p => !p),                            allowInInput: false },
    { key: 'f',     ctrl: true, action: () => { setShowFind(true); setTimeout(() => findInputRef.current?.focus(), 50); }, allowInInput: true },
  ], [running, project.envReady, code]);

  // Compute find matches from current query
  const findMatches = React.useMemo(() => {
    if (!findQuery) return [];
    const matches = [];
    const lower = code.toLowerCase();
    const q = findQuery.toLowerCase();
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) break;
      matches.push(idx);
      pos = idx + 1;
    }
    return matches;
  }, [code, findQuery]);

  const safeIndex = findMatches.length ? findIndex % findMatches.length : 0;

  const closeFindBar = () => { setShowFind(false); setFindQuery(''); };

  const navigateFind = (dir) => {
    if (!findMatches.length) return;
    setFindIndex(prev => (prev + dir + findMatches.length) % findMatches.length);
  };

  const handleTabKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newCode = code.substring(0, start) + '    ' + code.substring(end);
      setCode(newCode);
      setSaved(false);
      setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 4; }, 0);
    }
  };

  return (
    <div className="script-editor">
      {showEnvManager && (
        <EnvManager project={project} onClose={() => {
          setShowEnvManager(false);
          // refresh installed list after closing env manager
          api.listPackages(project.id).then(list => {
            const names = new Set((list || []).map(p => p.name.toLowerCase()));
            setInstalledPkgs([...names]);
            setMissingPkgs(prev => prev.filter(p => !names.has(p.toLowerCase())));
          });
        }} />
      )}

      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="script-title">{script.name}</span>
          {!saved && <span className="unsaved-dot" title="Unsaved changes" />}
        </div>
        <div className="toolbar-right">
          {inputFile && (
            <div className="input-badge" title={inputFile}>
              <FileInput size={11} />
              <span className="input-badge-name">{inputFile.split(/[\\/]/).pop()}</span>
              <div className="badge-info-wrap">
                <Info size={11} className="badge-info-icon" />
                <div className="badge-tooltip">
                  <div className="badge-tooltip-title">Use in your script:</div>
                  <code>import sys</code>
                  <code>path = sys.argv[1]</code>
                </div>
              </div>
              <button className="badge-close" onClick={() => setInputFile(null)}>✕</button>
            </div>
          )}
          <button className="toolbar-btn" onClick={handlePickInput} title="Attach input file">
            <FileInput size={14} /> Input file
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setShowEnvManager(true)}
            title={projectHasRunningScript ? 'Cannot manage packages while a script is running' : 'Manage packages'}
            disabled={projectHasRunningScript}
          >
            <Package size={14} /> Packages
          </button>
          <button className="toolbar-btn" onClick={handleDetect} title="Auto-detect imports" disabled={detecting}>
            {detecting
              ? <><Loader size={13} className="spin" /> Detecting…</>
              : <><Search size={14} /> Auto-detect</>}
          </button>
          <button
            className={`toolbar-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(p => !p)}
            title="Run history (Ctrl+H)"
          >
            <History size={14} /> History
            {runHistory.length > 0 && <span className="history-count">{runHistory.length}</span>}
          </button>
          <button className="toolbar-btn" onClick={handleSave} title="Save (Ctrl+S)" disabled={saved}>
            <Save size={14} /> {saved ? 'Saved' : 'Save'}
          </button>
          {running ? (
            <button className="toolbar-btn danger" onClick={handleStop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="toolbar-btn run" onClick={handleRun} disabled={!project.envReady}>
              <Play size={14} fill="currentColor" /> Run
            </button>
          )}
          <button
            className={`toolbar-btn ${showChat ? 'active' : ''}`}
            onClick={onToggleChat}
            title={showChat ? 'Close AI chat' : 'Open AI chat'}
            style={{ marginLeft: 4 }}
          >
            <MessageSquare size={14} />
          </button>
        </div>
      </div>

      {/* Auto-detect panel */}
      {showInstallPanel && (
        <div className="install-panel fade-in">
          <div className="install-panel-header">
            <span><Search size={13} /> Detected imports</span>
            <button className="icon-btn" onClick={() => setShowInstallPanel(false)}>✕</button>
          </div>
          {detecting ? (
            <div className="install-detecting"><Loader size={12} className="spin" /> Scanning…</div>
          ) : detectedPkgs.length === 0 ? (
            <div className="install-empty"><CheckCircle2 size={14} /> No third-party imports detected.</div>
          ) : (
            <>
              <div className="pkg-list">
                {detectedPkgs.map(pkg => {
                  const already = installedPkgs.includes(pkg.toLowerCase());
                  const isThis = installingPkg === pkg;
                  return (
                    <div className="pkg-item" key={pkg}>
                      <span className={`pkg-name ${already ? 'pkg-installed' : ''}`}>{pkg}</span>
                      {already ? (
                        <span className="pkg-badge-ok"><CheckCircle2 size={11} /> installed</span>
                      ) : (
                        <button className="btn-install-one" onClick={() => handleInstallOne(pkg)} disabled={!!installingPkg}>
                          {isThis ? <Loader size={11} className="spin" /> : 'Install'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {missingPkgs.length > 0 ? (
                <button className="btn-install-all" onClick={handleInstallAll} disabled={!!installingPkg}>
                  {installingPkg === 'all'
                    ? <><Loader size={12} className="spin" /> Installing {missingPkgs.length} package{missingPkgs.length > 1 ? 's' : ''}…</>
                    : `Install missing (${missingPkgs.length})`}
                </button>
              ) : (
                <div className="install-empty" style={{ marginTop: 8 }}>
                  <CheckCircle2 size={13} /> All detected packages are already installed!
                </div>
              )}
            </>
          )}
          {installLog.length > 0 && (
            <div className="install-log">
              {installLog.map((l, i) => <span key={i} className={`log-line ${l.type}`}>{l.text}</span>)}
            </div>
          )}
        </div>
      )}

      {/* ── Find bar ── */}
      {showFind && (
        <div className="find-bar">
          <Search size={13} className="find-bar-icon" />
          <input
            ref={findInputRef}
            className="find-bar-input"
            placeholder="Find in code…"
            value={findQuery}
            onChange={e => { setFindQuery(e.target.value); setFindIndex(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') closeFindBar();
              if (e.key === 'Enter') navigateFind(e.shiftKey ? -1 : 1);
            }}
          />
          <span className="find-bar-count">
            {findMatches.length === 0 ? (findQuery ? 'No results' : '') : `${safeIndex + 1} / ${findMatches.length}`}
          </span>
          <button className="find-bar-nav" onClick={() => navigateFind(-1)} disabled={!findMatches.length} title="Previous (Shift+Enter)">↑</button>
          <button className="find-bar-nav" onClick={() => navigateFind(1)}  disabled={!findMatches.length} title="Next (Enter)">↓</button>
          <button className="find-bar-close" onClick={closeFindBar} title="Close (Esc)">✕</button>
        </div>
      )}

      {/* ── Resizable split container ── */}
      <div className="split-container" ref={splitContainerRef}>

        {/* Code editor */}
        <div
          className={`code-area ${draggingOver ? 'drag-over' : ''}`}
          style={{ height: `${editorHeightPct}%` }}
          onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDraggingOver(true); }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDraggingOver(true); }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDraggingOver(false); }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation();
            setDraggingOver(false);
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            if (file.name.endsWith('.py')) {
              const reader = new FileReader();
              reader.onload = ev => { setCode(ev.target.result); setSaved(false); };
              reader.readAsText(file);
            } else {
              setInputFile(file.path || file.name);
            }
          }}
        >
          <div className="line-numbers" ref={lineNumbersRef} aria-hidden="true">
            {Array.from({ length: code.split('\n').length }, (_, i) => (
              <div key={i + 1} className="line-num"
                style={{ fontSize: settings.fontSize, lineHeight: String(settings.lineHeight) }}>
                {i + 1}
              </div>
            ))}
          </div>
          {settings.syntaxHighlight ? (
            <HighlightedEditor
              value={code}
              onChange={handleCodeChange}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              onScroll={syncLineNumberScroll}
              findMatches={findMatches}
              findActiveIndex={safeIndex}
              findQuery={findQuery}
            />
          ) : (
            <textarea
              className="code-textarea"
              value={code}
              onChange={handleCodeChange}
              onKeyDown={handleTabKey}
              onScroll={e => syncLineNumberScroll(e.target.scrollTop)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              wrap="off"
              style={{ fontSize: settings.fontSize, lineHeight: String(settings.lineHeight) }}
            />
          )}
          {draggingOver && (
            <div className="drop-overlay">
              <div className="drop-hint">
                <FileInput size={28} />
                <div>Drop a <strong>.py</strong> file to load code</div>
                <div>or any data file to use as input</div>
              </div>
            </div>
          )}
          {isLlmEditing && (
            <div className="llm-editing-overlay">
              <div className="llm-editing-box">
                <Loader size={18} className="spin" />
                <span>AI is editing the code…</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Drag divider ── */}
        <div className="resize-divider" onMouseDown={handleDividerMouseDown}>
          <div className="divider-grip" />
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="history-panel fade-in">
            <div className="history-panel-header">
              <span><History size={13} /> Run History</span>
              <button className="icon-btn" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            <RunHistory
              history={runHistory}
              onSelect={(run) => { setOutput(run.output); setShowHistory(false); }}
            />
          </div>
        )}

        {/* Output tabs */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div className="output-tabs">
            <button
              className={`output-tab ${outputTab === 'console' ? 'active' : ''}`}
              onClick={() => setOutputTab('console')}
            >
              <Terminal size={12} /> Console
            </button>
            <button
              className={`output-tab ${outputTab === 'files' ? 'active' : ''}`}
              onClick={() => setOutputTab('files')}
            >
              <Files size={12} /> Output Files
              {scriptFiles.length > 0 && <span className="output-tab-badge">{scriptFiles.length}</span>}
            </button>
            {lastExitCode !== null && lastExitCode !== 0 && onDebugWithAI && (
              <button
                className="output-tab debug-ai-btn"
                onClick={() => {
                  const summary = summarizeConsoleErrors(output);
                  onDebugWithAI(summary);
                }}
                title="Share errors with AI assistant"
              >
                <Bug size={12} /> Debug with AI
              </button>
            )}
          </div>

          {previewFile && (
            <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
          )}

          {outputTab === 'console' ? (
            <OutputConsole
              output={output}
              running={running}
              scriptName={script.name}
              onClear={() => setOutput([])}
            />
          ) : (
            <div className="files-panel">
              {scriptFiles.length === 0 ? (
                <div className="files-empty">
                  <Files size={22} />
                  <div>No output files yet.</div>
                  <div>Files saved by your script will appear here.</div>
                </div>
              ) : (
                <div className="files-list">
                  {scriptFiles.map(f => (
                    <div key={f.path} className="file-item">
                      <div className="file-item-info">
                        <span className="file-item-name">{f.name}</span>
                        <span className="file-item-size">{formatSize(f.size)} · {new Date(f.mtime).toLocaleString()}</span>
                      </div>
                      <div className="file-item-actions">
                        <button className="file-btn accent" title="Preview file" onClick={() => setPreviewFile(f)}>
                          <Eye size={13} /> Overview
                        </button>
                        <button className="file-btn" title="Open file" onClick={() => api.openFile(f.path)}>
                          <Download size={13} /> Open
                        </button>
                        <button className="file-btn" title="Show in folder" onClick={() => api.showFileInFolder(f.path)}>
                          <FolderOpen size={13} /> Show
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>{/* end split-container */}

      {/* Missing dependencies modal */}
      {showMissingDepsWarning && (
        <div className="modal-overlay" onClick={() => setShowMissingDepsWarning(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon" style={{ color: 'var(--red)' }}><Package size={22} /></div>
            <div className="modal-title">Missing dependencies</div>
            <div className="modal-body">
              Your script failed because the following package{missingDepNames.length > 1 ? 's are' : ' is'} not installed:
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {missingDepNames.map(n => (
                  <code key={n} style={{ background: 'var(--bg4)', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'var(--accent2)' }}>{n}</code>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={async () => {
                setShowMissingDepsWarning(false);
                setShowInstallPanel(true);
                setInstallLog([]);
                // Resolve import names → pip package names via IMPORT_TO_PIP map on backend
                const fakeCode = missingDepNames.map(n => `import ${n}`).join('\n');
                const resolved = await api.detectImports(fakeCode);
                const installed = await api.listPackages(project.id);
                const installedNames = new Set((installed || []).map(p => p.name.toLowerCase()));
                setInstalledPkgs([...installedNames]);
                setDetectedPkgs(resolved);
                setMissingPkgs(resolved.filter(p => !installedNames.has(p.toLowerCase())));
              }}>Install Missing</button>
              <button className="btn-ghost" onClick={() => setShowMissingDepsWarning(false)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Output path warning modal */}
      {showOutputWarning && (
        <div className="modal-overlay" onClick={() => setShowOutputWarning(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon"><FolderOutput size={22} /></div>
            <div className="modal-title">Output file may be saved outside Pyxenia</div>
            <div className="modal-body">
              Your script saves output files using the input file's path as a base. Those files won't appear in the <strong>Output Files</strong> tab.<br /><br />
              Use a relative path instead — Pyxenia runs scripts with the output folder as the working directory:<br />
              <code>output_file = "results.xlsx"</code><br />
              or: <code>output_file = os.path.splitext(os.path.basename(input_file))[0] + "_results.xlsx"</code>
            </div>
            <div className="modal-actions">
              {onDebugWithAI && (
                <button className="btn-primary" onClick={() => {
                  setShowOutputWarning(false);
                  onDebugWithAI(`My script saves output files using the input file path as a base (e.g. \`os.path.splitext(input_file)[0] + "_results.txt"\`). This saves files outside Pyxenia's output folder so they don't appear in the Output Files tab. Pyxenia sets the working directory (cwd) to the script's output folder at runtime, so output files should use plain relative paths like \`output_file = "results.xlsx"\` or \`output_file = os.path.splitext(os.path.basename(input_file))[0] + "_results.xlsx"\`. Do NOT use \`__file__\` or \`os.path.dirname(input_file)\`. Please fix the script accordingly.`);
                }}>AI Assistant</button>
              )}
              <button className="btn-ghost" onClick={() => { setShowOutputWarning(false); proceedToInputCheck(); }}>Run anyway</button>
              <button className="btn-ghost" onClick={() => setShowOutputWarning(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Input file warning modal */}
      {showInputWarning && (
        <div className="modal-overlay" onClick={() => setShowInputWarning(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon"><FileInput size={22} /></div>
            <div className="modal-title">No input file selected</div>
            <div className="modal-body">
              Your script uses <code>sys.argv</code> but no input file is attached. The script may crash or produce unexpected results.
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={async () => {
                setShowInputWarning(false);
                const p = await api.pickInputFile();
                if (p) { setInputFile(p); await doRun(p); }
              }}>Select a file</button>
              <button className="btn-ghost" onClick={() => { setShowInputWarning(false); doRun(); }}>Run anyway</button>
              <button className="btn-ghost" onClick={() => setShowInputWarning(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
