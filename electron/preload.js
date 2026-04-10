const { contextBridge, ipcRenderer } = require('electron');

// Prevent Electron from navigating when files are dropped outside a drop zone
document.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
document.addEventListener('drop',     e => { e.preventDefault(); e.stopPropagation(); });

contextBridge.exposeInMainWorld('pyxenia', {
  // Python
  checkPython: () => ipcRenderer.invoke('check-python'),

  // Projects
  getProjects:   () => ipcRenderer.invoke('get-projects'),
  createProject: (data) => ipcRenderer.invoke('create-project', data),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  updateProject: (data) => ipcRenderer.invoke('update-project', data),
  retryEnv:      (id) => ipcRenderer.invoke('retry-env', id),

  // Categories
  createCategory:        (data) => ipcRenderer.invoke('create-category', data),
  renameCategory:        (data) => ipcRenderer.invoke('rename-category', data),
  deleteCategory:        (id)   => ipcRenderer.invoke('delete-category', id),
  moveProjectToCategory: (data) => ipcRenderer.invoke('move-project-to-category', data),

  // Scripts
  saveScript:   (data) => ipcRenderer.invoke('save-script', data),
  readScript:   (filePath) => ipcRenderer.invoke('read-script', filePath),
  deleteScript: (data) => ipcRenderer.invoke('delete-script', data),
  importScript:  (projectId) => ipcRenderer.invoke('import-script', projectId),
  renameScript:  (data) => ipcRenderer.invoke('rename-script', data),

  // Input file / args
  pickInputFile:   () => ipcRenderer.invoke('pick-input-file'),
  parseScriptArgs: (code) => ipcRenderer.invoke('parse-script-args', code),

  // Run
  runScript:  (data) => ipcRenderer.invoke('run-script', data),
  stopScript: (scriptId) => ipcRenderer.invoke('stop-script', scriptId),

  // Packages
  installPackages:  (data) => ipcRenderer.invoke('install-packages', data),
  listPackages:     (projectId) => ipcRenderer.invoke('list-packages', projectId),
  uninstallPackage: (data) => ipcRenderer.invoke('uninstall-package', data),
  detectImports:    (code) => ipcRenderer.invoke('detect-imports', code),
  openProjectFolder:  (id) => ipcRenderer.invoke('open-project-folder', id),
  listScriptFiles:    (data) => ipcRenderer.invoke('list-script-files', data),
  openFile:           (filePath) => ipcRenderer.invoke('open-file', filePath),
  showFileInFolder:   (filePath) => ipcRenderer.invoke('show-file-in-folder', filePath),
  readOutputFile:     (filePath) => ipcRenderer.invoke('read-output-file', filePath),

  // Settings
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // API Keys
  saveApiKey:   (data) => ipcRenderer.invoke('save-api-key', data),
  getKeyStatus: () => ipcRenderer.invoke('get-key-status'),

  // Chat file attachment
  pickChatAttachment: () => ipcRenderer.invoke('pick-chat-attachment'),

  // Templates
  getTemplates:           ()             => ipcRenderer.invoke('get-templates'),
  installTemplate:        (data)         => ipcRenderer.invoke('install-template', data),
  downloadTemplateSample: (data)         => ipcRenderer.invoke('download-template-sample', data),
  openExternalUrl:        (url)          => ipcRenderer.invoke('open-external-url', url),

  // LLM Chat
  llmSend:  (data) => ipcRenderer.invoke('llm:send', data),
  llmAbort: (chatId) => ipcRenderer.invoke('llm:abort', chatId),

  // Events — each returns an unsubscribe function that removes only its own listener
  onScriptOutput:  (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('script-output',  h); return () => ipcRenderer.removeListener('script-output',  h); },
  onScriptDone:    (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('script-done',    h); return () => ipcRenderer.removeListener('script-done',    h); },
  onInstallOutput: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('install-output', h); return () => ipcRenderer.removeListener('install-output', h); },
  onInstallDone:   (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('install-done',   h); return () => ipcRenderer.removeListener('install-done',   h); },
  onEnvReady:      (cb) => { const h = (_, id) => cb(id); ipcRenderer.on('env-ready',    h); return () => ipcRenderer.removeListener('env-ready',      h); },
  onEnvError:      (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('env-error',      h); return () => ipcRenderer.removeListener('env-error',      h); },
  onEnvStatus:     (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('env-status',     h); return () => ipcRenderer.removeListener('env-status',     h); },
  onLlmToken:      (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:token',      h); return () => ipcRenderer.removeListener('llm:token',      h); },
  onLlmToolStart:  (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:tool-start', h); return () => ipcRenderer.removeListener('llm:tool-start', h); },
  onLlmToolDone:   (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:tool-done',  h); return () => ipcRenderer.removeListener('llm:tool-done',  h); },
  onLlmDone:       (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:done',       h); return () => ipcRenderer.removeListener('llm:done',       h); },
  onLlmError:      (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:error',      h); return () => ipcRenderer.removeListener('llm:error',      h); },
  onLlmHeartbeat:  (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('llm:heartbeat',  h); return () => ipcRenderer.removeListener('llm:heartbeat',  h); },
});
