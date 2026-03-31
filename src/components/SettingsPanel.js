import React, { useState, useEffect } from 'react';
import { Settings, X, Zap, Save, RotateCcw, Sun, Moon, Key, Eye, EyeOff, Check, Star, Plus, Trash2 } from 'lucide-react';
import { BUILTIN_PROVIDERS, loadLlmConfig, saveLlmConfig } from '../llmConfig';
import './SettingsPanel.css';

const DEFAULTS = {
  fontSize: 13,
  lineHeight: 1.65,
  tabSize: 4,
  outputLines: 1000,
  autosave: true,
  syntaxHighlight: true,
  confirmDelete: true,
  pythonPath: '',
  theme: 'dark',
};

// Must match the regex used in electron/llm.js — prevents invalid or oversized model IDs
const MODEL_ID_RE = /^[a-zA-Z0-9][\w.\-:]{0,100}$/;

const API_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-…' },
  { id: 'openai',    label: 'OpenAI',             placeholder: 'sk-…' },
  { id: 'gemini',    label: 'Google Gemini',       placeholder: 'AI…' },
];

export default function SettingsPanel({ onClose, onSettingsChange }) {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('pyxenia-settings');
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });
  const [saved, setSaved] = useState(false);

  // API keys state
  const [keyInputs, setKeyInputs] = useState({ anthropic: '', openai: '', gemini: '' });
  const [keyStatus, setKeyStatus] = useState({ anthropic: false, openai: false, gemini: false });
  const [showKey, setShowKey]   = useState({ anthropic: false, openai: false, gemini: false });
  const [keySaved, setKeySaved] = useState({ anthropic: false, openai: false, gemini: false });

  // LLM model config state
  const [llmConfig, setLlmConfig] = useState(() => loadLlmConfig());
  const [customModelInputs, setCustomModelInputs] = useState({ anthropic: '', openai: '', gemini: '' });

  const api = window.pyxenia;

  useEffect(() => {
    api.getKeyStatus().then(setKeyStatus);
  }, []);

  const set = (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    if (key === 'theme') onSettingsChange?.(next);
  };

  const handleSave = () => {
    localStorage.setItem('pyxenia-settings', JSON.stringify(settings));
    onSettingsChange?.(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
    localStorage.removeItem('pyxenia-settings');
    onSettingsChange?.(DEFAULTS);
  };

  const handleSaveKey = async (provider) => {
    const key = keyInputs[provider].trim();
    await api.saveApiKey({ provider, key: key || null });
    const status = await api.getKeyStatus();
    setKeyStatus(status);
    setKeyInputs(prev => ({ ...prev, [provider]: '' }));
    setKeySaved(prev => ({ ...prev, [provider]: true }));
    setTimeout(() => setKeySaved(prev => ({ ...prev, [provider]: false })), 2000);
  };

  const handleRemoveKey = async (provider) => {
    await api.saveApiKey({ provider, key: null });
    const status = await api.getKeyStatus();
    setKeyStatus(status);
  };

  const updateLlmConfig = (next) => {
    setLlmConfig(next);
    saveLlmConfig(next);
  };

  const handleSetDefault = (providerId, model) => {
    const next = { ...llmConfig, [providerId]: { ...(llmConfig[providerId] || {}), default: model } };
    updateLlmConfig(next);
  };

  const handleAddCustomModel = (providerId) => {
    const val = customModelInputs[providerId].trim();
    if (!val || !MODEL_ID_RE.test(val)) return;
    const provConf = llmConfig[providerId] || {};
    const custom = [...(provConf.custom || [])];
    if (custom.includes(val)) return;
    const next = { ...llmConfig, [providerId]: { ...provConf, custom: [...custom, val] } };
    updateLlmConfig(next);
    setCustomModelInputs(prev => ({ ...prev, [providerId]: '' }));
  };

  const handleRemoveCustomModel = (providerId, model) => {
    const provConf = llmConfig[providerId] || {};
    const custom = (provConf.custom || []).filter(m => m !== model);
    const next = { ...llmConfig, [providerId]: { ...provConf, custom } };
    // If removed model was the default, reset to first builtin
    if (provConf.default === model) {
      const builtin = BUILTIN_PROVIDERS.find(p => p.id === providerId);
      next[providerId].default = builtin?.models[0] || '';
    }
    updateLlmConfig(next);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title"><Settings size={15} /> Settings</div>
          <button className="settings-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="settings-body">

          {/* Appearance */}
          <div className="settings-section">
            <div className="settings-section-label">Appearance</div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Theme</div>
                <div className="setting-desc">Choose between dark and light mode</div>
              </div>
              <div className="theme-toggle-row">
                <button
                  className={`theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                  onClick={() => set('theme', 'dark')}
                >
                  <Moon size={13} /> Dark
                </button>
                <button
                  className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                  onClick={() => set('theme', 'light')}
                >
                  <Sun size={13} /> Light
                </button>
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="settings-section">
            <div className="settings-section-label">Editor</div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Font size</div>
                <div className="setting-desc">Code editor font size in pixels</div>
              </div>
              <div className="setting-control">
                <button className="stepper-btn" onClick={() => set('fontSize', Math.max(10, settings.fontSize - 1))}>−</button>
                <span className="stepper-val">{settings.fontSize}px</span>
                <button className="stepper-btn" onClick={() => set('fontSize', Math.min(22, settings.fontSize + 1))}>+</button>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Tab size</div>
                <div className="setting-desc">Spaces inserted when pressing Tab</div>
              </div>
              <div className="setting-control">
                {[2, 4, 8].map(n => (
                  <button key={n}
                    className={`tab-opt ${settings.tabSize === n ? 'active' : ''}`}
                    onClick={() => set('tabSize', n)}
                  >{n}</button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Syntax highlighting</div>
                <div className="setting-desc">Color Python keywords, strings, and comments</div>
              </div>
              <Toggle value={settings.syntaxHighlight} onChange={v => set('syntaxHighlight', v)} />
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Auto-save on run</div>
                <div className="setting-desc">Save your script automatically before running</div>
              </div>
              <Toggle value={settings.autosave} onChange={v => set('autosave', v)} />
            </div>
          </div>

          {/* Output */}
          <div className="settings-section">
            <div className="settings-section-label">Output Console</div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Max output lines</div>
                <div className="setting-desc">Older lines are trimmed to keep performance</div>
              </div>
              <div className="setting-control">
                {[200, 500, 1000, 5000].map(n => (
                  <button key={n}
                    className={`tab-opt ${settings.outputLines === n ? 'active' : ''}`}
                    onClick={() => set('outputLines', n)}
                  >{n >= 1000 ? `${n / 1000}k` : n}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Python */}
          <div className="settings-section">
            <div className="settings-section-label">Python</div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Custom Python path</div>
                <div className="setting-desc">Leave empty to use system Python 3</div>
              </div>
            </div>
            <input
              className="settings-input"
              placeholder="/usr/bin/python3 or C:\Python312\python.exe"
              value={settings.pythonPath}
              onChange={e => set('pythonPath', e.target.value)}
            />
            <div className="setting-row" style={{ marginTop: 10 }}>
              <div className="setting-info">
                <div className="setting-name">Confirm before deleting</div>
                <div className="setting-desc">Ask twice before removing projects or scripts</div>
              </div>
              <Toggle value={settings.confirmDelete} onChange={v => set('confirmDelete', v)} />
            </div>
          </div>

          {/* AI Models */}
          <div className="settings-section">
            <div className="settings-section-label">AI Assistant — Models</div>
            <div className="setting-row" style={{ marginBottom: 8 }}>
              <div className="setting-info">
                <div className="setting-name" style={{ fontWeight: 400, fontSize: 11, color: 'var(--text3)' }}>
                  Click the star to set a model as default. Add custom model IDs for any provider.
                </div>
              </div>
            </div>
            {BUILTIN_PROVIDERS.map(prov => {
              const provConf = llmConfig[prov.id] || {};
              const defaultModel = provConf.default || prov.models[0];
              const customModels = provConf.custom || [];
              const allModels = [...prov.models, ...customModels];
              return (
                <div key={prov.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{prov.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {allModels.map(m => (
                      <div key={m} className="model-config-row">
                        <button
                          className={`model-default-btn ${defaultModel === m ? 'active' : ''}`}
                          onClick={() => handleSetDefault(prov.id, m)}
                          title={defaultModel === m ? 'Default model' : 'Set as default'}
                        >
                          <Star size={11} />
                        </button>
                        <span className={`model-config-name ${defaultModel === m ? 'default' : ''}`}>{m}</span>
                        {!prov.models.includes(m) && (
                          <button
                            className="model-remove-btn"
                            onClick={() => handleRemoveCustomModel(prov.id, m)}
                            title="Remove custom model"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input
                      className="settings-input"
                      placeholder="Add custom model ID…"
                      value={customModelInputs[prov.id]}
                      onChange={e => setCustomModelInputs(prev => ({ ...prev, [prov.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomModel(prov.id)}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-primary"
                      style={{ flexShrink: 0, width: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => handleAddCustomModel(prov.id)}
                      disabled={!customModelInputs[prov.id].trim()}
                      title="Add model"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Assistant */}
          <div className="settings-section">
            <div className="settings-section-label">AI Assistant — API Keys</div>
            <div className="setting-row" style={{ marginBottom: 8 }}>
              <div className="setting-info">
                <div className="setting-name" style={{ fontWeight: 400, fontSize: 11, color: 'var(--text3)' }}>
                  Keys are stored encrypted using your OS keychain. They never leave your machine.
                </div>
              </div>
            </div>
            {API_PROVIDERS.map(p => (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <Key size={12} style={{ color: 'var(--text3)' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{p.label}</span>
                  {keyStatus[p.id] && (
                    <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(62,207,142,0.1)', padding: '1px 6px', borderRadius: 8 }}>
                      ● saved
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      className="settings-input"
                      type={showKey[p.id] ? 'text' : 'password'}
                      placeholder={keyStatus[p.id] ? '••••••••••••••••' : p.placeholder}
                      value={keyInputs[p.id]}
                      onChange={e => setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ paddingRight: 32 }}
                    />
                    <button
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}
                      onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    >
                      {showKey[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ flexShrink: 0, width: 64, fontSize: 11 }}
                    onClick={() => handleSaveKey(p.id)}
                    disabled={!keyInputs[p.id].trim()}
                  >
                    {keySaved[p.id] ? <Check size={12} /> : 'Save'}
                  </button>
                  {keyStatus[p.id] && (
                    <button
                      className="btn-ghost"
                      style={{ flexShrink: 0, fontSize: 11, padding: '4px 8px' }}
                      onClick={() => handleRemoveKey(p.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

        <div className="settings-footer">
          <button className="btn-reset" onClick={handleReset}>
            <RotateCcw size={13} /> Reset to defaults
          </button>
          <button className="btn-save-settings" onClick={handleSave}>
            {saved ? <><Zap size={13} /> Saved!</> : <><Save size={13} /> Save settings</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      className={`toggle ${value ? 'on' : 'off'}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <div className="toggle-thumb" />
    </button>
  );
}
