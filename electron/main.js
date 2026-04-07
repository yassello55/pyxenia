const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execFile } = require('child_process');
const os = require('os');
const envBus = require('./envBus');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DATA_DIR = path.join(os.homedir(), '.pyxenia');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// ─── Security helpers ─────────────────────────────────────────────────────────

// Ensure a file path stays within PROJECTS_DIR (prevents path traversal + symlink escape)
function isPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    // Use realpathSync to resolve symlinks; falls back to path.resolve if file doesn't exist yet
    const resolved = fs.existsSync(filePath)
      ? fs.realpathSync(filePath)
      : path.resolve(filePath);
    const allowedBase = fs.existsSync(PROJECTS_DIR)
      ? fs.realpathSync(PROJECTS_DIR)
      : path.resolve(PROJECTS_DIR);
    return resolved === allowedBase || resolved.startsWith(allowedBase + path.sep);
  } catch { return false; }
}

// Validate a pip package name/specifier — fixed to avoid ReDoS
const PACKAGE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}(\[[\w,\s]{0,50}\])?(===?|~=|!=|>=?|<=?[\w.*+!]{0,50})?$/;
function isValidPackageName(name) {
  return typeof name === 'string' && name.length <= 256 && PACKAGE_NAME_RE.test(name.trim());
}

// One-time migration: move ~/.pylaunch → ~/.pyxenia if old dir exists and new one doesn't
const OLD_DATA_DIR = path.join(os.homedir(), '.pylaunch');
if (fs.existsSync(OLD_DATA_DIR) && !fs.existsSync(DATA_DIR)) {
  try { fs.renameSync(OLD_DATA_DIR, DATA_DIR); } catch { fs.mkdirSync(DATA_DIR, { recursive: true }); }
}

[DATA_DIR, PROJECTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Runner script written to DATA_DIR — wraps user scripts to handle locked-file conflicts
const RUNNER_PATH = path.join(DATA_DIR, 'pyxenia_runner.py');
const RUNNER_CONTENT = `\
"""Pyxenia script runner — handles file-lock conflicts transparently."""
import sys, os, builtins, runpy

_orig_open = builtins.open

def _find_safe_path(filepath):
    """Find a free filename: file.ext -> file (1).ext -> file (2).ext ..."""
    if not os.path.exists(filepath):
        return filepath
    base, ext = os.path.splitext(filepath)
    n = 1
    while True:
        candidate = f"{base} ({n}){ext}"
        if not os.path.exists(candidate):
            return candidate
        n += 1

def _safe_open(file, mode='r', *args, **kwargs):
    # Default all text-mode opens to UTF-8 — avoids Windows cp1252 encoding errors
    if isinstance(mode, str) and 'b' not in mode and 'encoding' not in kwargs:
        kwargs['encoding'] = 'utf-8'
    if isinstance(mode, str) and any(c in mode for c in ('w', 'x')):
        try:
            return _orig_open(file, mode, *args, **kwargs)
        except PermissionError:
            fp = os.fspath(file) if hasattr(file, '__fspath__') else str(file)
            safe = _find_safe_path(fp)
            print(f"[Pyxenia] '{os.path.basename(fp)}' is in use — saving as '{os.path.basename(safe)}'")
            return _orig_open(safe, mode, *args, **kwargs)
    return _orig_open(file, mode, *args, **kwargs)

builtins.open = _safe_open

sys.argv = sys.argv[1:]
if not sys.argv:
    print("Pyxenia runner: no script specified", file=sys.stderr)
    sys.exit(1)

runpy.run_path(sys.argv[0], run_name='__main__')
`;
fs.writeFileSync(RUNNER_PATH, RUNNER_CONTENT, 'utf8');

let mainWindow;

// ─── Find Python ──────────────────────────────────────────────────────────────

function findPython() {
  // Check user-saved custom path first
  try {
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      // Validate pythonPath is an absolute path to an existing executable, no shell chars
    if (s.pythonPath && typeof s.pythonPath === 'string' &&
        s.pythonPath.length < 500 && !/[;&|`$<>]/.test(s.pythonPath) &&
        fs.existsSync(s.pythonPath)) return s.pythonPath;
    }
  } catch {}

  if (process.platform === 'win32') {
    const pathCandidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python39', 'python.exe'),
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
    ];
    // Check known paths first (no spawn needed — just fs.existsSync)
    for (const c of pathCandidates) {
      if (fs.existsSync(c)) return c;
    }
    // Fall back to PATH commands with a short timeout
    for (const c of ['python', 'python3']) {
      try {
        const result = require('child_process').spawnSync(c, ['--version'], { timeout: 1000 });
        if (result.status === 0) return c;
      } catch {}
    }
    return 'python';
  }
  return 'python3';
}

function getPythonVersion(pythonExe) {
  return new Promise((resolve) => {
    try {
      const result = require('child_process').spawnSync(pythonExe, ['--version'], { timeout: 5000 });
      if (result.status === 0) {
        const out = (result.stdout || result.stderr || '').toString().trim();
        resolve(out); // e.g. "Python 3.11.4"
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0d0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Block all navigation away from app origin
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? 'http://localhost:3000' : `file://${path.resolve(__dirname, '../build')}`;
    if (!url.startsWith(allowed)) {
      e.preventDefault();
    }
  });

  // Block any attempt to open new windows (window.open, target=_blank, etc.)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Content Security Policy
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; object-src blob:; connect-src 'none';";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── Projects ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = ['#7c6af7','#3ecf8e','#f56565','#f6c90e','#82aaff','#ffcb6b','#89ddff','#c792ea'];

function _loadData() {
  if (!fs.existsSync(PROJECTS_FILE)) return { categories: [], projects: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    // Migrate legacy flat array format
    if (Array.isArray(parsed)) {
      const migrated = { categories: [], projects: parsed };
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    return { categories: parsed.categories || [], projects: parsed.projects || [] };
  } catch { return { categories: [], projects: [] }; }
}

function _saveData(data) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

// Keep backward-compat helpers used throughout existing handlers
function loadProjects() { return _loadData().projects; }
function saveProjects(projects) {
  const data = _loadData();
  data.projects = projects;
  _saveData(data);
}

ipcMain.handle('get-projects', () => _loadData());

ipcMain.handle('create-category', (_, { name, color }) => {
  const safeName = String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 80);
  if (!safeName) return null;
  const safeColor = CATEGORY_COLORS.includes(color) ? color : CATEGORY_COLORS[0];
  const category = { id: `cat_${Date.now()}`, name: safeName, color: safeColor };
  const data = _loadData();
  data.categories.push(category);
  _saveData(data);
  return category;
});

ipcMain.handle('rename-category', (_, { id, name }) => {
  const safeName = String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 80);
  if (!safeName) return null;
  const data = _loadData();
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return null;
  cat.name = safeName;
  _saveData(data);
  return cat;
});

ipcMain.handle('delete-category', (_, id) => {
  const data = _loadData();
  data.categories = data.categories.filter(c => c.id !== id);
  data.projects = data.projects.map(p => p.categoryId === id ? { ...p, categoryId: null } : p);
  _saveData(data);
  return true;
});

ipcMain.handle('move-project-to-category', (_, { projectId, categoryId }) => {
  const data = _loadData();
  if (categoryId && !data.categories.find(c => c.id === categoryId)) return null;
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.categoryId = categoryId || null;
  _saveData(data);
  return project;
});

ipcMain.handle('check-python', async () => {
  const pythonExe = findPython();
  const version = await getPythonVersion(pythonExe);
  return { pythonExe, version, found: !!version };
});

ipcMain.handle('create-project', async (_, { name, description }) => {
  const safeName = String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 100);
  if (!safeName) return null;
  name = safeName;
  description = String(description || '').slice(0, 500);
  const id = `proj_${Date.now()}`;
  const projectDir = path.join(PROJECTS_DIR, id);
  const scriptsDir = path.join(projectDir, 'scripts');
  const envDir = path.join(projectDir, 'env');

  fs.mkdirSync(scriptsDir, { recursive: true });

  const project = {
    id, name, description,
    createdAt: new Date().toISOString(),
    scripts: [],
    envReady: false,
    envError: null,
    projectDir,
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  // Create venv — with full error reporting
  createVenv(id, projectDir, envDir);

  return project;
});

function createVenv(projectId, projectDir, envDir) {
  const pythonExe = findPython();

  // First confirm Python works
  getPythonVersion(pythonExe).then(version => {
    if (!version) {
      const projects = loadProjects();
      const p = projects.find(p => p.id === projectId);
      if (p) {
        p.envError = `Python not found. Please install Python 3 and restart Pyxenia, or set a custom Python path in Settings.`;
        saveProjects(projects);
      }
      mainWindow.webContents.send('env-error', {
        id: projectId,
        message: `Python not found. Install Python 3 from https://python.org and restart Pyxenia.`
      });
      return;
    }

    mainWindow.webContents.send('env-status', { id: projectId, message: `Found ${version} — creating virtual environment…` });

    const child = spawn(pythonExe, ['-m', 'venv', envDir]);

    // Real timeout — spawn() ignores the timeout option
    const killer = setTimeout(() => {
      child.kill();
      const projects = loadProjects();
      const p = projects.find(p => p.id === projectId);
      const errMsg = 'Virtual environment setup timed out after 60 seconds.';
      if (p) { p.envError = errMsg; saveProjects(projects); }
      mainWindow.webContents.send('env-error', { id: projectId, message: errMsg });
    }, 60000);

    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(killer);
      const projects = loadProjects();
      const p = projects.find(p => p.id === projectId);

      if (code === 0 && fs.existsSync(envDir)) {
        if (p) { p.envReady = true; p.envError = null; saveProjects(projects); }
        mainWindow.webContents.send('env-ready', projectId);
        envBus.emit('env-ready', projectId);
      } else {
        const errMsg = stderr || `venv creation failed with exit code ${code}`;
        if (p) { p.envError = errMsg; saveProjects(projects); }
        mainWindow.webContents.send('env-error', { id: projectId, message: errMsg });
      }
    });

    child.on('error', (err) => {
      clearTimeout(killer);
      const projects = loadProjects();
      const p = projects.find(p => p.id === projectId);
      const errMsg = `Could not start Python: ${err.message}`;
      if (p) { p.envError = errMsg; saveProjects(projects); }
      mainWindow.webContents.send('env-error', { id: projectId, message: errMsg });
    });
  });
}

ipcMain.handle('retry-env', (_, projectId) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  const envDir = path.join(project.projectDir, 'env');

  // Remove broken env folder if it exists
  if (fs.existsSync(envDir)) forceRemoveDir(envDir);

  // Reset state
  project.envReady = false;
  project.envError = null;
  saveProjects(projects);

  mainWindow.webContents.send('env-status', { id: projectId, message: 'Retrying environment setup…' });
  createVenv(projectId, project.projectDir, envDir);
  return true;
});

function forceRemoveDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  // On Windows, .pyd and other compiled files may be read-only — chmod before deleting
  const walk = (p) => {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      fs.readdirSync(p).forEach(f => walk(path.join(p, f)));
      try { fs.rmdirSync(p); } catch {}
    } else {
      try { fs.chmodSync(p, 0o666); } catch {}
      try { fs.unlinkSync(p); } catch {}
    }
  };
  try {
    walk(dirPath);
  } catch {
    // Final fallback: rmSync with force
    try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch {}
  }
}

ipcMain.handle('delete-project', (_, id) => {
  const projects = loadProjects();
  const p = projects.find(p => p.id === id);
  if (p && fs.existsSync(p.projectDir)) {
    forceRemoveDir(p.projectDir);
  }
  saveProjects(projects.filter(p => p.id !== id));
  return true;
});

ipcMain.handle('update-project', (_, { id, name, description }) => {
  const projects = loadProjects();
  const p = projects.find(p => p.id === id);
  if (!p) return null;
  p.name = String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 100);
  p.description = String(description || '').slice(0, 500);
  if (!p.name) return null;
  saveProjects(projects);
  return p;
});

// ─── Scripts ──────────────────────────────────────────────────────────────────

ipcMain.handle('save-script', (_, { projectId, scriptId, name, code }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;

  const scriptsDir = path.join(project.projectDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });

  const sid = scriptId || `script_${Date.now()}`;
  const filePath = path.join(scriptsDir, `${sid}.py`);
  fs.writeFileSync(filePath, code, 'utf8');

  let script = project.scripts.find(s => s.id === sid);
  if (script) {
    script.name = name;
    script.updatedAt = new Date().toISOString();
  } else {
    script = { id: sid, name, filePath, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    project.scripts.push(script);
  }

  saveProjects(projects);
  return script;
});

ipcMain.handle('read-script', (_, filePath) => {
  if (!isPathAllowed(filePath)) return '';
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
});

ipcMain.handle('delete-script', (_, { projectId, scriptId }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;
  const script = project.scripts.find(s => s.id === scriptId);
  if (script && fs.existsSync(script.filePath)) fs.unlinkSync(script.filePath);
  project.scripts = project.scripts.filter(s => s.id !== scriptId);
  saveProjects(projects);
  return true;
});

ipcMain.handle('rename-script', (_, { projectId, scriptId, name }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;
  const script = project.scripts.find(s => s.id === scriptId);
  if (!script) return false;
  const safeName = String(name || '').replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim().slice(0, 100);
  if (!safeName) return false;
  script.name = safeName;
  script.updatedAt = new Date().toISOString();
  saveProjects(projects);
  return script;
});

ipcMain.handle('import-script', async (_, projectId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Python Files', extensions: ['py'] }],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const code = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath, '.py');
  return { name, code };
});

// ─── File picker ──────────────────────────────────────────────────────────────

ipcMain.handle('pick-input-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Data Files', extensions: ['csv', 'json', 'txt', 'xlsx', 'xml', 'tsv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ─── Running scripts ──────────────────────────────────────────────────────────

const runningProcesses = {};

ipcMain.handle('run-script', (_, { projectId, scriptId, scriptArgs = [] }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return { error: 'Project not found' };

  const script = project.scripts.find(s => s.id === scriptId);
  if (!script) return { error: 'Script not found' };

  const envDir = path.join(project.projectDir, 'env');
  const pythonBin = process.platform === 'win32'
    ? path.join(envDir, 'Scripts', 'python.exe')
    : path.join(envDir, 'bin', 'python');

  const pythonExe = fs.existsSync(pythonBin) ? pythonBin : findPython();

  const args = [RUNNER_PATH, script.filePath];
  // Pass script args in index order, filling gaps with empty string so sys.argv indices are correct
  if (Array.isArray(scriptArgs) && scriptArgs.length > 0) {
    const maxIdx = Math.max(...scriptArgs.map(a => a.index));
    for (let i = 1; i <= maxIdx; i++) {
      const arg = scriptArgs.find(a => a.index === i);
      const val = arg?.value ? String(arg.value) : '';
      // For file args, skip if file doesn't exist (pass empty so script gets correct argv length)
      args.push(arg?.type === 'file' && val && !fs.existsSync(val) ? '' : val);
    }
  }

  // Each script gets its own output subdirectory so files don't mix across scripts
  const scriptOutputDir = path.join(path.dirname(script.filePath), script.id);
  if (!fs.existsSync(scriptOutputDir)) fs.mkdirSync(scriptOutputDir, { recursive: true });

  const child = spawn(pythonExe, args, {
    cwd: scriptOutputDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
  });

  runningProcesses[scriptId] = child;

  child.stdout.on('data', (data) => {
    mainWindow.webContents.send('script-output', { scriptId, data: data.toString(), type: 'stdout' });
  });

  child.stderr.on('data', (data) => {
    mainWindow.webContents.send('script-output', { scriptId, data: data.toString(), type: 'stderr' });
  });

  child.on('close', (code) => {
    delete runningProcesses[scriptId];
    mainWindow.webContents.send('script-done', { scriptId, code });
  });

  child.on('error', (err) => {
    delete runningProcesses[scriptId];
    mainWindow.webContents.send('script-output', { scriptId, data: `Error: ${err.message}\n`, type: 'stderr' });
    mainWindow.webContents.send('script-done', { scriptId, code: 1 });
  });

  return { started: true };
});

ipcMain.handle('stop-script', (_, scriptId) => {
  const child = runningProcesses[scriptId];
  if (child) { child.kill(); delete runningProcesses[scriptId]; return true; }
  return false;
});

// ─── Packages ─────────────────────────────────────────────────────────────────

function getPipExe(projectDir) {
  const envDir = path.join(projectDir, 'env');
  const pipBin = process.platform === 'win32'
    ? path.join(envDir, 'Scripts', 'pip.exe')
    : path.join(envDir, 'bin', 'pip');
  return fs.existsSync(pipBin) ? pipBin : null;
}

ipcMain.handle('install-packages', (_, { projectId, packages }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  if (!Array.isArray(packages) || packages.length === 0) return false;
  const invalid = packages.filter(p => !isValidPackageName(p));
  if (invalid.length > 0) {
    mainWindow.webContents.send('install-output', { type: 'stderr', data: `❌ Invalid package name(s): ${invalid.join(', ')}\n` });
    mainWindow.webContents.send('install-done', { code: 1 });
    return false;
  }

  const pipExe = getPipExe(project.projectDir);
  if (!pipExe) {
    mainWindow.webContents.send('install-output', {
      type: 'stderr',
      data: `❌ pip not found — environment may not be set up yet.\nTry clicking "Retry Setup" on the project.\n`
    });
    mainWindow.webContents.send('install-done', { code: 1 });
    return false;
  }

  mainWindow.webContents.send('install-output', { type: 'info', data: `📦 Installing: ${packages.join(', ')}\n` });

  const child = spawn(pipExe, ['install', ...packages, '--no-cache-dir'], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  child.stdout.on('data', d => mainWindow.webContents.send('install-output', { type: 'stdout', data: d.toString() }));
  child.stderr.on('data', d => mainWindow.webContents.send('install-output', { type: 'stderr', data: d.toString() }));
  child.on('close', code => mainWindow.webContents.send('install-done', { code }));
  child.on('error', err => {
    mainWindow.webContents.send('install-output', { type: 'stderr', data: `Error: ${err.message}\n` });
    mainWindow.webContents.send('install-done', { code: 1 });
  });

  return true;
});

ipcMain.handle('list-packages', (_, projectId) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return [];

  const pipExe = getPipExe(project.projectDir);
  if (!pipExe) return [];

  return new Promise((resolve) => {
    const child = spawn(pipExe, ['list', '--format=json']);
    let stdout = '';
    const killer = setTimeout(() => { child.kill(); resolve([]); }, 15000);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.on('close', () => {
      clearTimeout(killer);
      try { resolve(JSON.parse(stdout)); } catch { resolve([]); }
    });
    child.on('error', () => { clearTimeout(killer); resolve([]); });
  });
});

ipcMain.handle('uninstall-package', (_, { projectId, packageName }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  if (!isValidPackageName(packageName)) return false;

  const pipExe = getPipExe(project.projectDir);
  if (!pipExe) return false;

  return new Promise((resolve) => {
    const child = spawn(pipExe, ['uninstall', '-y', packageName]);
    const killer = setTimeout(() => { child.kill(); resolve(false); }, 30000);
    child.on('close', (code) => { clearTimeout(killer); resolve(code === 0); });
    child.on('error', () => { clearTimeout(killer); resolve(false); });
  });
});

// Maps Python import name → pip install name for packages where they differ
const IMPORT_TO_PIP = {
  fitz: 'pymupdf',
  cv2: 'opencv-python',
  PIL: 'Pillow',
  sklearn: 'scikit-learn',
  bs4: 'beautifulsoup4',
  yaml: 'pyyaml',
  serial: 'pyserial',
  usb: 'pyusb',
  Crypto: 'pycryptodome',
  OpenSSL: 'pyOpenSSL',
  gi: 'PyGObject',
  wx: 'wxPython',
  dateutil: 'python-dateutil',
  dotenv: 'python-dotenv',
  magic: 'python-magic',
  docx: 'python-docx',
  pptx: 'python-pptx',
  discord: 'discord.py',
  jwt: 'PyJWT',
  apscheduler: 'APScheduler',
  pkg_resources: 'setuptools',
  skimage: 'scikit-image',
  attr: 'attrs',
  boto3: 'boto3',
  googlesearch: 'googlesearch-python',
  fake_useragent: 'fake-useragent',
  bs4: 'beautifulsoup4',
  lxml: 'lxml',
  werkzeug: 'Werkzeug',
  flask: 'Flask',
  django: 'Django',
  sqlalchemy: 'SQLAlchemy',
  aiohttp: 'aiohttp',
  httpx: 'httpx',
};

// Parse the # args: block from a Python script and return arg definitions
ipcMain.handle('parse-script-args', (_, code) => {
  const lines = code.split('\n');
  const args = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#\s*args\s*:/i.test(trimmed)) { inBlock = true; continue; }
    if (inBlock) {
      if (!trimmed.startsWith('#')) break; // end of block
      // Match:  #   1: var_name (file|value) - hint text
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
});

ipcMain.handle('detect-imports', (_, code) => {
  const lines = code.split('\n');
  const imports = new Set();
  const builtins = new Set([
    'os','sys','re','math','json','csv','io','time','datetime','collections',
    'itertools','functools','pathlib','shutil','subprocess','threading','logging',
    'random','string','hashlib','base64','copy','typing','abc','contextlib',
    'dataclasses','enum','struct','tempfile','traceback','warnings','weakref',
    'gc','inspect','ast','dis','pdb','unittest','doctest','argparse','getpass',
    'glob','fnmatch','stat','socket','http','urllib','email','html','xml',
    'sqlite3','pickle','shelve','zipfile','tarfile','gzip','bz2','lzma','zlib',
    'decimal','fractions','statistics','cmath','array','queue','heapq','bisect',
    'pprint','__future__','builtins','site','platform','textwrap','unicodedata',
    'codecs','locale','gettext','calendar','uuid','secrets','hmac','difflib',
  ]);

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse pip install lines from both # comments and docstring bodies:
    //   # pip install pkg1 pkg2
    //   pip install pkg1 pkg2   (inside """ docstrings)
    const pipLine = trimmed.match(/^#?\s*pip\s+install\s+(.+)/i);
    if (pipLine) {
      pipLine[1].split(/\s+/).forEach(token => {
        // Strip version specifiers and extras: pkg==1.0, pkg>=2, pkg[extra]
        const name = token.split(/[=<>!\[]/)[0].trim();
        if (name && isValidPackageName(name)) imports.add(name);
      });
      continue;
    }

    const m1 = trimmed.match(/^import\s+([\w.]+)/);
    const m2 = trimmed.match(/^from\s+([\w.]+)\s+import/);
    const pkg = (m1 || m2)?.[1]?.split('.')[0];
    if (pkg && !builtins.has(pkg) && !pkg.startsWith('_')) imports.add(pkg);
  }
  // Normalize hyphens/underscores (pip treats them as equivalent) then deduplicate
  return [...new Set([...imports].map(pkg => (IMPORT_TO_PIP[pkg] || pkg).replace(/_/g, '-')))];
});

ipcMain.handle('open-project-folder', (_, projectId) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (project && fs.existsSync(project.projectDir)) {
    shell.openPath(project.projectDir);
  }
});

ipcMain.handle('list-script-files', (_, { projectId, scriptId }) => {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return [];
  const script = project.scripts.find(s => s.id === scriptId);
  if (!script) return [];
  const dir = path.join(path.dirname(script.filePath), script.id);
  if (!isPathAllowed(dir) || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => !f.endsWith('.py'))
    .map(f => {
      const full = path.join(dir, f);
      if (!isPathAllowed(full)) return null;
      const stat = fs.statSync(full);
      return { name: f, path: full, size: stat.size, mtime: stat.mtime.toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
});

ipcMain.handle('open-file', (_, filePath) => {
  if (!isPathAllowed(filePath)) return;
  shell.openPath(filePath);
});

ipcMain.handle('show-file-in-folder', (_, filePath) => {
  if (!isPathAllowed(filePath)) return;
  shell.showItemInFolder(filePath);
});

ipcMain.handle('read-output-file', (_, filePath) => {
  if (!isPathAllowed(filePath) || !fs.existsSync(filePath)) return null;
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
  const BINARY_EXTS = ['.xlsx', '.xls', '.xlsm', '.pdf'];
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) {
    const data = fs.readFileSync(filePath);
    const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1).replace('jpg','jpeg')}`;
    return { type: 'image', content: `data:${mime};base64,${data.toString('base64')}` };
  }
  if (ext === '.pdf') {
    const data = fs.readFileSync(filePath);
    return { type: 'pdf', content: data.toString('base64') };
  }
  if (BINARY_EXTS.includes(ext)) {
    const data = fs.readFileSync(filePath);
    return { type: 'excel', content: data.toString('base64') };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return { type: 'text', content: text };
});

// ─── Settings persistence ──────────────────────────────────────────────────────

ipcMain.handle('save-settings', (_, settings) => {
  try {
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    return true;
  } catch { return false; }
});

ipcMain.handle('load-settings', () => {
  try {
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {}
  return {};
});

// ─── Chat file attachment ──────────────────────────────────────────────────────

ipcMain.handle('pick-chat-attachment', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Data & Documents', extensions: ['csv', 'tsv', 'xlsx', 'xls', 'json', 'txt', 'log', 'md', 'xml', 'pdf'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const { parseAttachment } = require('./fileParser');
  return parseAttachment(filePath);
});

// ─── API Key Store ─────────────────────────────────────────────────────────────

ipcMain.handle('save-api-key', (_, { provider, key }) => {
  const { saveKey } = require('./apiKeyStore');
  return saveKey(provider, key);
});

ipcMain.handle('get-key-status', () => {
  const { getKeyStatus } = require('./apiKeyStore');
  return getKeyStatus();
});

// ─── LLM Chat ─────────────────────────────────────────────────────────────────

// Track ongoing chat abort signals keyed by chatId
const chatAbortControllers = {};

ipcMain.handle('llm:send', async (_, { chatId, messages, provider, model, context }) => {
  if (!chatId || !messages || !provider) return { error: 'Missing required fields' };

  const { getKey } = require('./apiKeyStore');
  const apiKey = getKey(provider);
  if (!apiKey) {
    console.error(`[LLM] No API key for provider: ${provider}`);
    return { error: `No API key saved for ${provider}. Add your key in Settings.` };
  }

  // Abort any existing stream for this chat
  if (chatAbortControllers[chatId]) {
    chatAbortControllers[chatId].aborted = true;
    delete chatAbortControllers[chatId];
  }
  const abortRef = { aborted: false };
  chatAbortControllers[chatId] = abortRef;

  // Enrich context with projects list
  const data = _loadData();
  const enrichedContext = {
    ...context,
    projects: data.projects || [],
  };

  const { chat } = require('./llm');

  console.log(`[LLM] Starting chat: provider=${provider} model=${model} chatId=${chatId}`);

  try {
    const fullText = await chat({
      provider, model, apiKey, messages, context: enrichedContext,
      onToken: (text) => {
        if (!abortRef.aborted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:token', { chatId, text });
        }
      },
      onToolStart: (toolName, toolInput) => {
        if (!abortRef.aborted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:tool-start', { chatId, toolName, toolInput });
        }
      },
      onToolDone: (toolName, result) => {
        if (!abortRef.aborted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:tool-done', { chatId, toolName, result });
        }
      },
      onHeartbeat: () => {
        if (!abortRef.aborted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:heartbeat', { chatId });
        }
      },
    });

    if (!abortRef.aborted) {
      console.log(`[LLM] Done: chatId=${chatId} length=${fullText.length}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llm:done', { chatId, fullText });
      }
    }

    delete chatAbortControllers[chatId];
    return { ok: true };
  } catch (err) {
    // Only send the error if this request wasn't superseded by a newer one
    if (!abortRef.aborted) {
      console.error(`[LLM] Error: chatId=${chatId}`, err);
      const msg = err.message || 'Unknown error';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llm:error', { chatId, message: msg });
      }
      delete chatAbortControllers[chatId];
      return { error: msg };
    }
    delete chatAbortControllers[chatId];
    return { ok: true };
  }
});

ipcMain.handle('llm:abort', (_, chatId) => {
  if (chatAbortControllers[chatId]) {
    chatAbortControllers[chatId].aborted = true;
    delete chatAbortControllers[chatId];
  }
  return true;
});
