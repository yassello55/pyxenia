// ─── LLM model configuration ─────────────────────────────────────────────────
// Stored in localStorage under 'pyxenia-llm-config'.
// Shape: { [providerId]: { default: string, custom: string[] } }

export const BUILTIN_PROVIDERS = [
  { id: 'anthropic', label: 'Claude',  models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'] },
  { id: 'openai',    label: 'OpenAI',  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'gemini',    label: 'Gemini',  models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
];

const STORAGE_KEY = 'pyxenia-llm-config';

export function loadLlmConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveLlmConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Return all models for a provider (builtin + custom), and the current default. */
export function getProviderConfig(providerId) {
  const builtin = BUILTIN_PROVIDERS.find(p => p.id === providerId);
  const config = loadLlmConfig()[providerId] || {};
  const custom = config.custom || [];
  const allModels = [...(builtin?.models || []), ...custom];
  const defaultModel = config.default || allModels[0] || '';
  return { allModels, defaultModel, custom };
}
