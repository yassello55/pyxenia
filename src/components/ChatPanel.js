import React, { useState, useEffect, useRef, useContext } from 'react';
import { MessageSquare, X, Trash2, Send, Square, ChevronDown, ChevronRight, Loader, Check, AlertCircle, Bot, Paperclip, FileText, Image, Sheet, FileJson, Copy } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { SettingsContext } from '../App';
import { BUILTIN_PROVIDERS, getProviderConfig } from '../llmConfig';
import './ChatPanel.css';

const CHAT_ID = 'main'; // single persistent chat session per window

// ─── Code block with copy button ─────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang || 'code'}</span>
        <button className="chat-code-copy" onClick={handleCopy} title="Copy code">
          {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

// ─── Markdown-light renderer (code blocks + bold) ─────────────────────────────
function renderContent(text) {
  if (!text) return null;

  const parts = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let match;

  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<InlineText key={lastIdx} text={text.slice(lastIdx, match.index)} />);
    }
    parts.push(<CodeBlock key={match.index} lang={match[1]} code={match[2].trimEnd()} />);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(<InlineText key={lastIdx} text={text.slice(lastIdx)} />);
  }
  return parts;
}

function InlineText({ text }) {
  // Render inline `code` and **bold**
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = [];
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('`')) {
      parts.push(<code key={m.index}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── Single step row ──────────────────────────────────────────────────────────
function StepRow({ step }) {
  const [expanded, setExpanded] = useState(false);
  const label = step.tool.replace(/_/g, ' ');

  return (
    <div>
      <div className="chat-step">
        <span className={`step-icon ${step.status}`}>
          {step.status === 'running' ? <Loader size={12} /> : <Check size={12} />}
        </span>
        <span className="step-name">{label}</span>
        {step.result && (
          <button className="step-expand-btn" onClick={() => setExpanded(p => !p)}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
      </div>
      {expanded && step.result && (
        <div className="step-result">
          {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
        </div>
      )}
    </div>
  );
}

// ─── Attachment card (shown inside user message) ──────────────────────────────
function AttachmentCard({ attachment }) {
  const icons = { csv: <Sheet size={13} />, excel: <Sheet size={13} />, json: <FileJson size={13} />, image: <Image size={13} />, text: <FileText size={13} />, pdf: <FileText size={13} /> };
  const icon = icons[attachment.type] || <FileText size={13} />;
  const name = attachment.filePath ? attachment.filePath.split(/[\\/]/).pop() : 'Attached file';
  return (
    <div className="chat-attachment-card">
      {icon}
      <span className="attach-name">{name}</span>
      <span className="attach-type">{attachment.type.toUpperCase()}</span>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  return (
    <div className={`chat-msg ${msg.role}`}>
      {msg.steps && msg.steps.length > 0 && (
        <div className="chat-steps">
          {msg.steps.map((step, i) => <StepRow key={i} step={step} />)}
        </div>
      )}
      {msg.attachment && <AttachmentCard attachment={msg.attachment} />}
      {(msg.content || msg.streaming) && (
        <div className={`chat-msg-bubble ${msg.error ? 'error' : ''}`}>
          {msg.error
            ? msg.error
            : <>
                {renderContent(msg.content)}
                {msg.streaming && !msg.content && <span style={{ color: 'var(--text3)' }}>Thinking…</span>}
                {msg.streaming && <span className="stream-cursor" />}
              </>
          }
        </div>
      )}
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────
const DEFAULT_SCRIPT_PLACEHOLDER = 'print("Hello from Pyxenia!")';

export default function ChatPanel({ onClose, activeProject, activeScript, activeScriptCode, scriptArgs, onOpenSettings, debugMessage, onDebugMessageUsed, onLlmEditingChange }) {
  const { settings } = useContext(SettingsContext);
  const { messages, isStreaming, isLlmEditing, error, sendMessage, abort, clear } = useChat(CHAT_ID);

  // Notify parent when LLM write_script editing state changes
  const prevLlmEditing = useRef(false);
  useEffect(() => {
    if (isLlmEditing !== prevLlmEditing.current) {
      prevLlmEditing.current = isLlmEditing;
      onLlmEditingChange?.(isLlmEditing);
    }
  }, [isLlmEditing, onLlmEditingChange]);

  const [provider, setProvider] = useState(() => {
    const stored = localStorage.getItem('llm-provider');
    return BUILTIN_PROVIDERS.some(p => p.id === stored) ? stored : 'anthropic';
  });
  const [model, setModel] = useState(() => {
    const stored = localStorage.getItem('llm-provider');
    const safe = BUILTIN_PROVIDERS.some(p => p.id === stored) ? stored : 'anthropic';
    return getProviderConfig(safe).defaultModel;
  });
  const [availableModels, setAvailableModels] = useState(() => {
    const stored = localStorage.getItem('llm-provider');
    const safe = BUILTIN_PROVIDERS.some(p => p.id === stored) ? stored : 'anthropic';
    return getProviderConfig(safe).allModels;
  });
  const [keyStatus, setKeyStatus] = useState({});
  const [input, setInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const bottomRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const userScrolledUp = useRef(false);
  const textareaRef = useRef(null);
  const api = window.pyxenia;

  const providerDef = BUILTIN_PROVIDERS.find(p => p.id === provider) || BUILTIN_PROVIDERS[0];

  // Load key status on mount
  useEffect(() => {
    api.getKeyStatus().then(setKeyStatus);
  }, []);

  // Persist provider choice and refresh model list + default when provider changes
  useEffect(() => {
    localStorage.setItem('llm-provider', provider);
    const { allModels, defaultModel } = getProviderConfig(provider);
    setAvailableModels(allModels);
    setModel(defaultModel);
  }, [provider]);

  // Scroll to bottom on new messages, unless user has scrolled up to read
  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleChatScroll = () => {
    const el = chatMessagesRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !atBottom;
  };

  // Auto-send debug message when it arrives
  useEffect(() => {
    if (!debugMessage) return;
    const { summary, script } = debugMessage;
    const text = `I ran **${script?.name || 'my script'}** and got these errors:\n\`\`\`\n${summary}\n\`\`\`\nCan you help me debug this?`;
    onDebugMessageUsed?.();
    // Only auto-send if we have an API key and are not already streaming
    if (!isStreaming && keyStatus[provider]) {
      userScrolledUp.current = false;
      const context = {
        activeProject: activeProject || null,
        activeScript: activeScript || null,
        scriptArgs: scriptArgs || [],
      };
      sendMessage(text, { provider, model: model || availableModels[0], context, attachment: null });
    } else {
      // Fallback: pre-fill so the user can send manually
      setInput(text);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
          textareaRef.current.focus();
        }
      }, 50);
    }
  }, [debugMessage]);

  const hasKey = !!keyStatus[provider];

  const handleAttach = async () => {
    const result = await api.pickChatAttachment();
    if (result) setPendingAttachment(result);
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachment) || isStreaming || !hasKey) return;
    const text = input.trim();
    const attachment = pendingAttachment;
    setInput('');
    setPendingAttachment(null);
    userScrolledUp.current = false;
    textareaRef.current?.style && (textareaRef.current.style.height = 'auto');

    const context = {
      activeProject: activeProject || null,
      activeScript: activeScript || null,
      scriptArgs: scriptArgs || [],
    };

    await sendMessage(text, { provider, model: model || availableModels[0], context, attachment });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  const isGlobalChat = !activeProject;
  const isBlankScript = !activeScriptCode || activeScriptCode.trim() === DEFAULT_SCRIPT_PLACEHOLDER || activeScriptCode.trim() === '';

  let suggestions, emptyTitle, emptyDesc;

  if (isGlobalChat) {
    emptyTitle = 'What would you like to build?';
    emptyDesc = 'I can help you create scripts, organise your projects, explain Python concepts, and more.';
    suggestions = [
      'How do I create my first project?',
      'How should I organise my projects?',
      'Explain how Pyxenia works',
      'Write me a Python script I can run right now (no input needed)',
      'What Python libraries are best for automation?',
    ];
  } else if (isBlankScript) {
    emptyTitle = 'What would you like to build?';
    emptyDesc = 'Your script is empty. Tell me what you want to do and I\'ll write the code for you.';
    suggestions = [
      activeScript ? `Write a script for "${activeScript.name}"` : 'Write me a Python script',
      'I need a script that reads a CSV file and analyses it',
      'How do I install packages for this project?',
      'How do I pass an input file to my script?',
      'What can I build with Python?',
    ];
  } else {
    emptyTitle = 'How can I help?';
    emptyDesc = 'I can read your scripts, explain code, help debug issues, and suggest improvements.';
    suggestions = [
      activeScript ? `Explain the "${activeScript.name}" script` : 'Explain my Python script',
      activeScript ? `Debug the "${activeScript.name}" script` : 'Help me debug my script',
      'What packages does my script need?',
      'How can I improve my script\'s performance?',
    ];
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <Bot size={15} style={{ color: 'var(--accent)' }} />
        <span className="chat-header-title">Pyxenia Assistant</span>

        {/* Model selector */}
        <div className="model-selector">
          <select className="model-select" value={provider} onChange={e => setProvider(e.target.value)}>
            {BUILTIN_PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select className="model-select" value={model} onChange={e => setModel(e.target.value)}>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="chat-header-actions">
          <button className="chat-icon-btn danger" onClick={clear} title="Clear chat">
            <Trash2 size={14} />
          </button>
          <button className="chat-icon-btn" onClick={onClose} title="Close chat">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* No key warning */}
      {!hasKey && (
        <div className="chat-no-key">
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            No API key for {providerDef.label}. <a onClick={onOpenSettings}>Open Settings</a> to add your key.
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" ref={chatMessagesRef} onScroll={handleChatScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <Bot size={32} style={{ color: 'var(--accent)', opacity: 0.6 }} />
            <div className="chat-empty-title">{emptyTitle}</div>
            <div className="chat-empty-desc">{emptyDesc}</div>
            {hasKey && (
              <div className="chat-suggestions">
                {suggestions.map((s, i) => (
                  <button key={i} className="chat-suggestion-btn" onClick={() => {
                    const context = {
                      activeProject: activeProject || null,
                      activeScript: activeScript || null,
                      inputFilePath: inputFilePath || null,
                    };
                    sendMessage(s, { provider, model: model || availableModels[0], context, attachment: null });
                  }}>{s}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        {/* Pending attachment preview */}
        {pendingAttachment && (
          <div className="chat-pending-attachment">
            <AttachmentCard attachment={pendingAttachment} />
            <button className="attach-remove-btn" onClick={() => setPendingAttachment(null)} title="Remove attachment">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="chat-input-row">
          <button
            className="chat-attach-btn"
            onClick={handleAttach}
            disabled={!hasKey || isStreaming}
            title="Attach file (CSV, JSON, Excel, image…)"
          >
            <Paperclip size={15} />
          </button>
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={hasKey ? 'Ask anything about your scripts…' : `Add a ${providerDef.label} API key in Settings first`}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={!hasKey || isStreaming}
            rows={1}
          />
          {isStreaming ? (
            <button className="chat-send-btn stop" onClick={abort} title="Stop">
              <Square size={15} />
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!hasKey || (!input.trim() && !pendingAttachment)}
              title="Send (Enter)"
            >
              <Send size={15} />
            </button>
          )}
        </div>
        <div className="chat-input-hint">Enter to send · Shift+Enter for new line · Paperclip to attach a file</div>
      </div>
    </div>
  );
}
