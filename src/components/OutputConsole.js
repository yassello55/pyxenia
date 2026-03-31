import React, { useState, useRef, useEffect } from 'react';
import {
  Trash2, Search, X,
  Download, AlertCircle, CheckCircle2, Loader
} from 'lucide-react';
import './OutputConsole.css';

export default function OutputConsole({ output, running, onClear, scriptName }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showSearch, setShowSearch] = useState(false);
  const bodyRef = useRef(null);
  const searchRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when running
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  // Detect manual scroll up = pause auto-scroll
  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(nearBottom);
  };

  // Open search with Ctrl+F
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setShowSearch(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleExport = () => {
    const text = output.map(l => l.text).join('');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scriptName || 'output'}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter + search
  const filteredOutput = output.filter(line => {
    const typeOk = filterType === 'all' || line.type === filterType || line.type === 'info';
    const searchOk = !searchQuery || line.text.toLowerCase().includes(searchQuery.toLowerCase());
    return typeOk && searchOk;
  });

  // Highlight matching text
  const highlight = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="search-match">{p}</mark>
        : p
    );
  };

  const stderrCount = output.filter(l => l.type === 'stderr').length;
  const hasOutput = output.length > 0;

  return (
    <div className="output-console">
      {/* Header */}
      <div className="console-header">
        <div className="console-header-left">
          {running && <Loader size={12} className="spin-icon" />}
          {!running && stderrCount > 0 && <AlertCircle size={12} style={{ color: 'var(--red)' }} />}
          {!running && hasOutput && stderrCount === 0 && <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />}
          <span className="console-label">Output</span>
          {running && <span className="running-pill">running</span>}
          {!running && stderrCount > 0 && (
            <span className="error-pill">{stderrCount} error{stderrCount > 1 ? 's' : ''}</span>
          )}
          {searchQuery && <span className="match-pill">{filteredOutput.length} matches</span>}
        </div>
        <div className="console-header-right" onClick={e => e.stopPropagation()}>
          {hasOutput && (
            <>
              <button
                className={`console-icon-btn ${filterType === 'stderr' ? 'active-red' : ''}`}
                onClick={() => setFilterType(p => p === 'stderr' ? 'all' : 'stderr')}
                title="Show errors only"
              >
                <AlertCircle size={12} />
              </button>
              <button
                className={`console-icon-btn ${showSearch ? 'active' : ''}`}
                onClick={() => { setShowSearch(p => !p); setTimeout(() => searchRef.current?.focus(), 50); }}
                title="Search output (Ctrl+F)"
              >
                <Search size={12} />
              </button>
              <button className="console-icon-btn" onClick={handleExport} title="Export output">
                <Download size={12} />
              </button>
              <button className="console-icon-btn" onClick={onClear} title="Clear output">
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="console-search fade-in">
          <Search size={12} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            className="console-search-input"
            placeholder="Search output…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="console-icon-btn" onClick={() => setSearchQuery('')}>
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="console-body" ref={bodyRef} onScroll={handleScroll}>
        {filteredOutput.length === 0 && !running ? (
          <span className="console-empty">
            {searchQuery ? `No matches for "${searchQuery}"` : 'No output yet. Click Run to execute your script.'}
          </span>
        ) : (
          filteredOutput.map((line, i) => (
            <span key={i} className={`console-line ${line.type}`}>
              {searchQuery ? highlight(line.text, searchQuery) : line.text}
            </span>
          ))
        )}
        {running && <span className="console-cursor">▋</span>}
      </div>
    </div>
  );
}
