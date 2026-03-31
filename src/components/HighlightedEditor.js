import React, { useRef, useEffect, useCallback } from 'react';
import { tokenizePython, TOKEN_COLORS } from '../utils/pythonHighlighter';
import './HighlightedEditor.css';

/**
 * A code editor that renders real syntax highlighting behind a transparent textarea.
 * The textarea handles all input; the highlight layer is display-only.
 */
export default function HighlightedEditor({ value, onChange, onKeyDown, fontSize, lineHeight, onScroll }) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

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

  // Build highlighted HTML from tokens
  const renderHighlighted = (code) => {
    const tokens = tokenizePython(code);
    return tokens.map((tok, i) => {
      if (tok.text === '\n') return <br key={i} />;
      return (
        <span key={i} style={{ color: TOKEN_COLORS[tok.type] || TOKEN_COLORS.plain }}>
          {tok.text}
        </span>
      );
    });
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
