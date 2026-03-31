const { safeStorage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.pyxenia');
const KEYS_FILE = path.join(DATA_DIR, 'apikeys.enc');
const VALID_PROVIDERS = new Set(['anthropic', 'openai', 'gemini']);

// Fallback AES-256-GCM encryption using a machine-unique key derived from app path + username
function _getFallbackKey() {
  const seed = `pyxenia-${os.userInfo().username}-${app.getPath('userData')}`;
  return crypto.createHash('sha256').update(seed).digest();
}

function _fallbackEncrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = _getFallbackKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function _fallbackDecrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const encrypted = buf.slice(28);
  const key = _getFallbackKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function _loadRaw() {
  try {
    if (fs.existsSync(KEYS_FILE)) return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveKey(provider, key) {
  if (!VALID_PROVIDERS.has(provider)) return false;
  const data = _loadRaw();
  if (!key) {
    delete data[provider];
  } else if (safeStorage.isEncryptionAvailable()) {
    data[provider] = { v: 2, d: safeStorage.encryptString(String(key)).toString('base64') };
  } else {
    // AES-256-GCM fallback — still encrypted, not base64-plaintext
    data[provider] = { v: 3, d: _fallbackEncrypt(String(key)) };
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return true;
}

function getKey(provider) {
  const data = _loadRaw();
  const entry = data[provider];
  if (!entry) return null;
  try {
    // Legacy base64-plaintext (v1 — no version field, just a string)
    if (typeof entry === 'string') {
      return Buffer.from(entry, 'base64').toString('utf8');
    }
    if (entry.v === 2) return safeStorage.decryptString(Buffer.from(entry.d, 'base64'));
    if (entry.v === 3) return _fallbackDecrypt(entry.d);
  } catch { return null; }
  return null;
}

// Returns { anthropic: bool, openai: bool, gemini: bool }
function getKeyStatus() {
  const data = _loadRaw();
  return {
    anthropic: !!data.anthropic,
    openai: !!data.openai,
    gemini: !!data.gemini,
  };
}

module.exports = { saveKey, getKey, getKeyStatus };
