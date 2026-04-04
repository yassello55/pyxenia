import { useRef, useEffect, useCallback } from 'react';
import { tokenizePython, TOKEN_COLORS } from '../utils/pythonHighlighter';
import './HighlightedEditor.css';

/**
 * A code editor that renders real syntax highlighting behind a transparent textarea.
 * The textarea handles all input; the highlight layer is display-only.
 */
export default function HighlightedEditor({ value, onChange, onKeyDown, fontSize, lineHeight, onScroll, findMatches = [], findActiveIndex = 0, findQuery = '' }) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

  // Scroll textarea to active find match
  useEffect(() => {
    if (!findMatches.length || !textareaRef.current) return;
    const pos = findMatches[findActiveIndex];
    if (pos == null) return;
    const ta = textareaRef.current;
    ta.setSelectionRange(pos, pos + findQuery.length);
    // Measure line height to scroll the match into the vertical center
    const lines = ta.value.substring(0, pos).split('\n');
    const lineNum = lines.length - 1;
    const lineH = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const targetScroll = lineNum * lineH - ta.clientHeight / 2 + lineH;
    ta.scrollTop = Math.max(0, targetScroll);
  }, [findActiveIndex, findMatches, findQuery]);

  // Sync scroll between textarea and highlight layer, and notify parent for line numbers
  const syncScroll = useCallback(() => {
    if (!textareaRef.current || !highlightRef.current) return;
    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    onScroll?.(textareaRef.current.scrollTop);
  }, [onScroll]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener('scroll', syncScroll, { passive: true });
    return () => ta.removeEventListener('scroll', syncScroll);
  }, [syncScroll]);

  // Build highlighted HTML, injecting find-match backgrounds on top of syntax colors
  const renderHighlighted = (code) => {
    const tokens = tokenizePython(code);

    // If no search, fast path: just render syntax tokens
    if (!findQuery || findMatches.length === 0) {
      return tokens.map((tok, i) => {
        if (tok.text === '\n') return <br key={i} />;
        return <span key={i} style={{ color: TOKEN_COLORS[tok.type] || TOKEN_COLORS.plain }}>{tok.text}</span>;
      });
    }

    // Build flat character array with token colors
    const chars = []; // { char, color }
    let pos = 0;
    for (const tok of tokens) {
      const color = TOKEN_COLORS[tok.type] || TOKEN_COLORS.plain;
      for (const ch of tok.text) {
        chars.push({ char: ch, color, pos: pos++ });
      }
    }

    // Mark match ranges
    const qLen = findQuery.length;
    const matchSet = new Map(); // charPos → 'active' | 'match'
    findMatches.forEach((start, idx) => {
      const kind = idx === findActiveIndex ? 'active' : 'match';
      for (let j = 0; j < qLen; j++) matchSet.set(start + j, kind);
    });

    // Rebuild into spans, grouping consecutive chars with same color+match state
    const result = [];
    let i = 0;
    while (i < chars.length) {
      const { char, color } = chars[i];
      const kind = matchSet.get(chars[i].pos);
      if (char === '\n') { result.push(<br key={i} />); i++; continue; }
      // Collect run of same color+kind
      let text = char;
      let j = i + 1;
      while (j < chars.length && chars[j].char !== '\n' && chars[j].color === color && matchSet.get(chars[j].pos) === kind) {
        text += chars[j].char; j++;
      }
      const style = { color };
      if (kind === 'active') { style.background = 'rgba(255,200,0,0.55)'; style.borderRadius = '2px'; }
      else if (kind === 'match') { style.background = 'rgba(124,111,247,0.35)'; style.borderRadius = '2px'; }
      result.push(<span key={i} style={style}>{text}</span>);
      i = j;
    }
    return result;
  };

  // Handle Tab key in editor
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const indent = '    ';

      if (start === end) {
        // Simple indent
        const newVal = value.substring(0, start) + indent + value.substring(end);
        onChange({ target: { value: newVal } });
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + indent.length;
        });
      } else {
        // Multi-line indent
        const lines = value.split('\n');
        let charCount = 0;
        let startLine = 0, endLine = 0;
        for (let i = 0; i < lines.length; i++) {
          if (charCount + lines[i].length >= start && startLine === 0) startLine = i;
          if (charCount + lines[i].length >= end) { endLine = i; break; }
          charCount += lines[i].length + 1;
        }
        const newLines = lines.map((l, i) =>
          i >= startLine && i <= endLine ? indent + l : l
        );
        onChange({ target: { value: newLines.join('\n') } });
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <div className="highlighted-editor">
      {/* Highlight layer */}
      <div className="highlight-layer" ref={highlightRef} aria-hidden="true">
        <pre className="highlight-pre" style={{ fontSize, lineHeight: lineHeight != null ? String(lineHeight) : undefined }}>{renderHighlighted(value)}{'\n'}</pre>
      </div>
      {/* Transparent textarea on top */}
      <textarea
        ref={textareaRef}
        className="highlight-textarea"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        wrap="off"
        style={{ fontSize, lineHeight: lineHeight != null ? String(lineHeight) : undefined }}
      />
    </div>
  );
}
