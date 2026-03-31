import React from 'react';
import { Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import './RunHistory.css';

export default function RunHistory({ history, onSelect }) {
  if (!history || history.length === 0) {
    return (
      <div className="history-empty">
        <Clock size={20} style={{ color: 'var(--text3)', marginBottom: 6 }}/>
        <div>No runs yet</div>
        <div className="history-empty-sub">Your run history will appear here</div>
      </div>
    );
  }

  return (
    <div className="run-history">
      {history.slice().reverse().map((run, i) => (
        <div
          key={i}
          className={`history-item ${run.exitCode === 0 ? 'success' : 'fail'}`}
          onClick={() => onSelect && onSelect(run)}
        >
          <div className="history-icon">
            {run.exitCode === 0
              ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }}/>
              : <XCircle size={14} style={{ color: 'var(--red)' }}/>
            }
          </div>
          <div className="history-info">
            <div className="history-time">{new Date(run.timestamp).toLocaleString()}</div>
            <div className="history-preview">{run.outputPreview || '(no output)'}</div>
          </div>
          <ChevronRight size={12} style={{ color: 'var(--text3)', flexShrink: 0 }}/>
        </div>
      ))}
    </div>
  );
}
