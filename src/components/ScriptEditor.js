import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  Play, Square, Save, Package, FileInput, FolderOutput, History,
  CheckCircle2, Loader, Search, FolderOpen, Download, Terminal, Files, Eye, MessageSquare, Bug, SlidersHorizontal
} from 'lucide-react';

// ─── Helpers: parse # args: block from script code ───────────────────────────

function parseArgsBlock(code) {
  const lines = code.split('\n');
  const args = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#\s*args\s*:/i.test(trimmed)) { inBlock = true; continue; }
    if (inBlock) {
      if (!trimmed.startsWith('#')) break;
      const m = trimmed.match(/^#\s+(\d+):\s+(\w+)\s+\((file|value)\)\s*(?:-\s*(.+))?$/i);
      if (m) {
        args.push({
          index: parseInt(m[1], 10),
          label: m[2].replace(/_/g, ' '),
          type: m[3].toLowerCase(),
          hint: (m[4] || '').trim(),
        });
      }
    }
  }
  return args;
}

// Fallback: detect sys.argv[N] usages and guess type from context
function detectArgsFromCode(code) {
  const indices = new Set();
  const re = /sys\.argv\s*\[\s*(\d+)\s*\]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx >= 1) indices.add(idx);
  }
  return [...indices].sort((a, b) => a - b).map(idx => {
    // Look for assignment: varname = sys.argv[idx]
    const assignRe = new RegExp(`(\\w+)\\s*=\\s*sys\\.argv\\s*\\[\\s*${idx}\\s*\\]`);
    const assignMatch = assignRe.exec(code);
    const varName = assignMatch?.[1] || `arg${idx}`;

    // Guess type
    const idxPat = `sys\\.argv\\s*\\[\\s*${idx}\\s*\\]`;
    const fileSignals = [
      /open\s*\(/, /Path\s*\(/, /os\.path\.(?:exists|basename|splitext|dirname)\s*\(/,
      /pd\.read_(?:csv|excel|json|parquet)\s*\(/, /Image\.open\s*\(/,
    ];
    const isFile =
      fileSignals.some(sig => new RegExp(idxPat + '[^)]*\\)').test(code) && sig.test(code)) ||
      ['file', 'path', 'input', 'image', 'csv', 'excel', 'dir', 'folder'].some(w => varName.toLowerCase().includes(w));
    const isValue = new RegExp(`(?:int|float|str)\\s*\\(\\s*${idxPat}`).test(code);

    return {
      index: idx,
      label: varName.replace(/_/g, ' '),
      type: isFile && !isValue ? 'file' : 'value',
      hint: '',
    };
  });
}
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

export default function ScriptEditor({ script, project, onSave, showChat, onToggleChat, onDebugWithAI, onCodeLoad, onRunningChange, projectHasRunningScript, isRunning: initialRunning, initialCache, onCacheUpdate, isLlmEditing, onScriptArgsChange }) {
  const { settings } = useContext(SettingsContext);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState(initialCache?.output || []);
  const [running, setRunning] = useState(initialRunning || false);
  const [saved, setSaved] = useState(true);
  const [showOutputWarning, setShowOutputWarning] = useState(false);

  // Script arguments (replaces single inputFile)
  const [scriptArgs, setScriptArgs] = useState(() => {
    try {
      const stored = localStorage.getItem(`pyxenia-args-${script.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showInputsPanel, setShowInputsPanel] = useState(false);
  const [showMissingArgsWarning, setShowMissingArgsWarning] = useState(false);
  const [missingArgLabels, setMissingArgLabels] = useState([]);

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

  // Merge detected arg definitions into scriptArgs state, preserving user-set values
  const autoDetectArgs = useCallback((src) => {
    const parsed = parseArgsBlock(src);
    const detected = parsed.length > 0 ? parsed : detectArgsFromCode(src);
    if (detected.length === 0) return;
    setScriptArgs(prev => {
      const merged = detected.map(def => {
        const existing = prev.find(a => a.index === def.index);
        return { ...def, value: existing?.value || '', required: true };
      });
      // Keep manually-added args not found in detection
      const extra = prev.filter(a => !detected.find(d => d.index === a.index));
      return [...merged, ...extra].sort((a, b) => a.index - b.index);
    });
  }, []);

  // Load code + immediately detect args from the freshly-read source
  useEffect(() => {
    api.readScript(script.filePath).then(c => {
      const loaded = c || '';
      setCode(loaded);
      onCodeLoad?.(loaded);
      autoDetectArgs(loaded); // use loaded string directly — avoids stale state read
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
        autoDetectArgs(loaded); // pick up any # args: changes the LLM wrote
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
      // ModuleNotFoundError: No module named 'xxx'
      // ImportError: No module named 'xxx'  (but NOT "cannot import name" — that's wrong API usage)
      for (const m of allText.matchAll(/(?:ModuleNotFoundError|ImportError): No module named '([^']+)'/g))
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
        invalidatePkgCache(); // force re-check on next Run
        window.pyxenia.listPackages(project.id).then(list => {
          const names = new Set((list || []).map(p => p.name.toLowerCase()));
          installedPkgsCacheRef.current = names; // warm cache with fresh data
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

  // Persist args to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(`pyxenia-args-${script.id}`, JSON.stringify(scriptArgs)); } catch {}
    onScriptArgsChange?.(scriptArgs);
  }, [scriptArgs]);

  // Re-detect args when code changes (debounced — not on every keystroke)
  const detectDebounceRef = useRef(null);
  useEffect(() => {
    if (!code) return;
    if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current);
    detectDebounceRef.current = setTimeout(() => autoDetectArgs(code), 800);
    return () => { if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current); };
  }, [code, autoDetectArgs]);

  const updateArg = (i, field, val) => setScriptArgs(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  const removeArg = (i) => setScriptArgs(prev => prev.filter((_, idx) => idx !== i));
  const addArg = () => setScriptArgs(prev => {
    const maxIdx = prev.length > 0 ? Math.max(...prev.map(a => a.index)) : 0;
    return [...prev, { index: maxIdx + 1, label: `arg ${maxIdx + 1}`, type: 'value', hint: '', value: '', required: false }];
  });

  const handlePickArgFile = async (i) => {
    const p = await api.pickInputFile();
    if (p) updateArg(i, 'value', p);
  };

  const doRun = async () => {
    await handleSave();
    setOutput([]);
    currentOutputRef.current = [];
    setLastExitCode(null);
    setRunning(true);
    onRunningChange?.(true, null);
    setShowHistory(false);
    await api.runScript({ projectId: project.id, scriptId: script.id, scriptArgs });
  };

  // Step 2: check args, then run
  const proceedToInputCheck = () => {
    const usesArgv = /sys\.argv\s*\[/.test(code);
    if (usesArgv && scriptArgs.length === 0) {
      // Script uses argv but user hasn't defined any args — open the panel as a hint
      setShowInputsPanel(true);
      return;
    }
    const missing = scriptArgs.filter(a => a.required && !a.value);
    if (missing.length > 0) {
      setMissingArgLabels(missing.map(a => a.label));
      setShowMissingArgsWarning(true);
    } else {
      doRun();
    }
  };

  // Step 0: check for missing packages before running
  const [showPreRunDepsWarning, setShowPreRunDepsWarning] = useState(false);
  const [preRunMissingPkgs, setPreRunMissingPkgs] = useState([]);
  // Cache installed packages so we don't call `pip list` on every single Run click
  const installedPkgsCacheRef = useRef(null); // null = not loaded yet

  const getInstalledPackages = async () => {
    if (installedPkgsCacheRef.current) return installedPkgsCacheRef.current;
    const list = await api.listPackages(project.id);
    const names = new Set((list || []).map(p => p.name.toLowerCase()));
    installedPkgsCacheRef.current = names;
    return names;
  };

  // Invalidate cache whenever packages are installed or uninstalled
  const invalidatePkgCache = () => { installedPkgsCacheRef.current = null; };

  const checkDepsAndRun = async () => {
    const [detected, installedNames] = await Promise.all([
      api.detectImports(code),
      getInstalledPackages(),
    ]);
    const missing = detected.filter(p => !installedNames.has(p.toLowerCase()));
    if (missing.length > 0) {
      setPreRunMissingPkgs(missing);
      setShowPreRunDepsWarning(true);
    } else {
      handleRun();
    }
  };

  // Step 1: check if output files will be saved outside the app folder
  const handleRun = () => {
    // Risky: input file's *directory* is used as the output location
    // Safe: only the *basename* (filename) is extracted from input_file — directory is not preserved
    const riskyOutput = (
      // dirname(input_file) — explicitly saves to input file's directory
      /os\.path\.dirname\s*\(.*(?:input_file\b|sys\.argv)/.test(code) ||
      // splitext applied directly to input path (not wrapped in basename) — full path including dir
      /os\.path\.splitext\s*\(\s*(?:input_file\b|sys\.argv\s*\[\s*1\s*\])/.test(code) ||
      // direct string ops on input_file that preserve the path (slice, replace, rsplit on the full path)
      /(?:input_file\b|sys\.argv\s*\[\s*1\s*\])\s*(?:\[:-?\d+\]|\.replace\s*\(|\.rsplit\s*\()/.test(code)
    );
    if (riskyOutput) {
      setShowOutputWarning(true);
    } else {
      proceedToInputCheck();
    }
  };

  const handleStop = () => { api.stopScript(script.id); setRunning(false); onRunningChange?.(false, null); };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = script.name.endsWith('.py') ? script.name : `${script.name}.py`;
    a.click();
    URL.revokeObjectURL(url);
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
    { key: 'Enter', ctrl: true, action: () => { if (!running && project.envReady) checkDepsAndRun(); }, allowInInput: true },
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
          {(() => {
            const filled = scriptArgs.filter(a => a.value).length;
            const total = scriptArgs.length;
            const hasMissing = scriptArgs.some(a => a.required && !a.value);
            return (
              <button
                className={`toolbar-btn ${showInputsPanel ? 'active' : ''}`}
                onClick={() => setShowInputsPanel(p => !p)}
                title="Script input arguments"
              >
                <SlidersHorizontal size={14} /> Inputs
                {total > 0 && (
                  <span className={`inputs-badge ${hasMissing ? 'inputs-badge--warn' : 'inputs-badge--ok'}`}>
                    {filled}/{total}
                  </span>
                )}
              </button>
            );
          })()}
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
            className={`toolbar-btn icon-only ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(p => !p)}
            title="Run history (Ctrl+H)"
          >
            <History size={14} />
            {runHistory.length > 0 && <span className="history-count">{runHistory.length}</span>}
          </button>
          <button className="toolbar-btn icon-only" onClick={handleDownload} title="Download .py file">
            <Download size={14} />
          </button>
          <button className="toolbar-btn icon-only" onClick={handleSave} title="Save (Ctrl+S)" disabled={saved}>
            <Save size={14} />
          </button>
          {running ? (
            <button className="toolbar-btn danger" onClick={handleStop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="toolbar-btn run" onClick={checkDepsAndRun} disabled={!project.envReady}>
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

      {/* ── Inputs panel ── */}
      {showInputsPanel && (
        <div className="inputs-panel fade-in">
          <div className="inputs-panel-header">
            <span><SlidersHorizontal size={13} /> Script Inputs</span>
            <button className="icon-btn" onClick={() => setShowInputsPanel(false)}>✕</button>
          </div>
          {scriptArgs.length === 0 ? (
            <div className="inputs-empty">
              No arguments defined. Add a <code># args:</code> block to your script, or add manually below.
            </div>
          ) : (
            <div className="args-list">
              {scriptArgs.map((arg, i) => (
                <div key={arg.index} className="arg-row">
                  <span className="arg-index">[{arg.index}]</span>
                  <input
                    className="arg-label-input"
                    value={arg.label}
                    onChange={e => updateArg(i, 'label', e.target.value)}
                    placeholder="Label"
                    title="Argument label"
                  />
                  <select
                    className="arg-type-select"
                    value={arg.type}
                    onChange={e => updateArg(i, 'type', e.target.value)}
                    title="Argument type"
                  >
                    <option value="file">📁 File</option>
                    <option value="value"># Value</option>
                  </select>
                  {arg.type === 'file' ? (
                    <div className="arg-file-row">
                      <span className="arg-file-name" title={arg.value || ''}>
                        {arg.value ? arg.value.split(/[\\/]/).pop() : <span className="arg-placeholder">No file selected</span>}
                      </span>
                      <button className="arg-browse-btn" onClick={() => handlePickArgFile(i)}>Browse…</button>
                      {arg.value && <button className="arg-clear-btn" onClick={() => updateArg(i, 'value', '')}>✕</button>}
                    </div>
                  ) : (
                    <input
                      className="arg-value-input"
                      value={arg.value || ''}
                      onChange={e => updateArg(i, 'value', e.target.value)}
                      placeholder={arg.hint || 'Enter value…'}
                      title={arg.hint || ''}
                    />
                  )}
                  <button
                    className="arg-required-btn"
                    title={arg.required ? 'Required — click to make optional' : 'Optional — click to make required'}
                    onClick={() => updateArg(i, 'required', !arg.required)}
                  >
                    {arg.required ? '★' : '☆'}
                  </button>
                  <button className="arg-remove-btn" onClick={() => removeArg(i)} title="Remove">✕</button>
                </div>
              ))}
            </div>
          )}
          <button className="inputs-add-btn" onClick={addArg}>+ Add argument</button>
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
              // Set dropped file as value of the first file-type arg, or add one if none exist
              const filePath = file.path || file.name;
              setScriptArgs(prev => {
                const firstFileIdx = prev.findIndex(a => a.type === 'file');
                if (firstFileIdx >= 0) {
                  return prev.map((a, i) => i === firstFileIdx ? { ...a, value: filePath } : a);
                }
                // No file arg defined — add one at index 1 (or next available)
                const maxIdx = prev.length > 0 ? Math.max(...prev.map(a => a.index)) : 0;
                return [...prev, { index: maxIdx + 1, label: 'input file', type: 'file', hint: '', value: filePath, required: true }].sort((a, b) => a.index - b.index);
              });
              setShowInputsPanel(true);
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

      {/* Pre-run missing packages modal */}
      {showPreRunDepsWarning && (
        <div className="modal-overlay" onClick={() => setShowPreRunDepsWarning(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon" style={{ color: 'var(--red)' }}><Package size={22} /></div>
            <div className="modal-title">Missing packages</div>
            <div className="modal-body">
              Your script requires the following package{preRunMissingPkgs.length > 1 ? 's' : ''} that {preRunMissingPkgs.length > 1 ? 'are' : 'is'} not installed:
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {preRunMissingPkgs.map(n => (
                  <code key={n} style={{ background: 'var(--bg4)', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'var(--accent2)' }}>{n}</code>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={async () => {
                setShowPreRunDepsWarning(false);
                setShowInstallPanel(true);
                setInstallLog([]);
                const installed = await api.listPackages(project.id);
                const installedNames = new Set((installed || []).map(p => p.name.toLowerCase()));
                setInstalledPkgs([...installedNames]);
                setDetectedPkgs(preRunMissingPkgs);
                setMissingPkgs(preRunMissingPkgs.filter(p => !installedNames.has(p.toLowerCase())));
              }}>Install</button>
              <button className="btn-ghost" onClick={() => { setShowPreRunDepsWarning(false); handleRun(); }}>Run anyway</button>
              <button className="btn-ghost" onClick={() => setShowPreRunDepsWarning(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
              <code>output_file = "output.csv"</code><br />
              or derive only the filename from input: <code>output_file = os.path.splitext(os.path.basename(input_file))[0] + "_results.csv"</code>
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

      {/* Missing args modal */}
      {showMissingArgsWarning && (
        <div className="modal-overlay" onClick={() => setShowMissingArgsWarning(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon"><SlidersHorizontal size={22} /></div>
            <div className="modal-title">Missing input values</div>
            <div className="modal-body">
              The following argument{missingArgLabels.length > 1 ? 's are' : ' is'} required but not set:
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {missingArgLabels.map(l => (
                  <code key={l} style={{ background: 'var(--bg4)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{l}</code>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => { setShowMissingArgsWarning(false); setShowInputsPanel(true); }}>Set values</button>
              <button className="btn-ghost" onClick={() => { setShowMissingArgsWarning(false); doRun(); }}>Run anyway</button>
              <button className="btn-ghost" onClick={() => setShowMissingArgsWarning(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
