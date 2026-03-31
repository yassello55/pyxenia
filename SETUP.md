# Pyxenia — Developer Setup Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | Included with Node.js |
| Python | 3.8+ | https://www.python.org |
| Git | any | https://git-scm.com |

Python must be available in your system PATH as `python3` (macOS/Linux) or `python` (Windows).

---

## Quick start (development)

```bash
# 1. Clone the repo
git clone https://github.com/your-username/pyxenia.git
cd pyxenia

# 2. Install Node dependencies
npm install

# 3. Launch in development mode (hot reload)
npm run dev
```

This starts both the React dev server (port 3000) and Electron simultaneously.

---

## Project structure

```
pyxenia/
├── .github/
│   └── workflows/
│       └── build.yml          ← CI: builds .dmg / .exe / .AppImage on tag push
│
├── electron/
│   ├── main.js                ← Node.js main process
│   │                             • Creates/manages projects on disk (~/.pyxenia/)
│   │                             • Spawns Python processes via child_process
│   │                             • Manages venv creation, pip installs
│   │                             • Handles all IPC calls from React
│   └── preload.js             ← Secure contextBridge (window.pyxenia.*)
│
├── src/
│   ├── App.js                 ← Root component, settings context, routing
│   │
│   ├── components/
│   │   ├── Sidebar.js         ← Project list, create/delete projects
│   │   ├── WelcomeScreen.js   ← Onboarding for new users
│   │   ├── ProjectView.js     ← Script list panel + editor area
│   │   ├── ScriptEditor.js    ← Main editor: toolbar, editor, output
│   │   ├── HighlightedEditor.js ← Syntax-highlighted code editor (overlay pattern)
│   │   ├── OutputConsole.js   ← Output panel: search, filter, export
│   │   ├── EnvManager.js      ← Package manager modal
│   │   ├── RunHistory.js      ← Per-script run history
│   │   ├── SettingsPanel.js   ← App settings modal
│   │   └── AboutModal.js      ← About + keyboard shortcuts
│   │
│   ├── hooks/
│   │   ├── useSettings.js          ← Global settings (persisted in localStorage)
│   │   ├── useKeyboardShortcuts.js ← Global keyboard shortcut system
│   │   └── useLocalStorage.js      ← Generic localStorage hook
│   │
│   └── utils/
│       └── pythonHighlighter.js    ← Tokenizer for Python syntax highlighting
│
├── public/
│   └── index.html
│
├── package.json
├── README.md
├── SETUP.md          ← This file
├── CONTRIBUTING.md
└── CHANGELOG.md
```

---

## Data storage

Pyxenia stores all user data in `~/.pyxenia/` (never inside the app bundle):

```
~/.pyxenia/
├── projects.json              ← Project metadata list
└── projects/
    └── proj_<timestamp>/
        ├── env/               ← Python venv (created via python3 -m venv)
        └── scripts/
            ├── script_<id>.py
            └── ...
```

---

## How a script runs

1. User clicks **Run** → React calls `window.pyxenia.runScript(...)`
2. `preload.js` forwards to `ipcMain.handle('run-script')` in `main.js`
3. `main.js` locates the project's `venv/bin/python` (or falls back to system Python)
4. Spawns `python script.py [inputFile]` via `child_process.spawn`
5. `stdout` and `stderr` are streamed back to React via `mainWindow.webContents.send('script-output', ...)`
6. React's `OutputConsole` component renders each chunk in real time

---

## Building for distribution

```bash
# Build React + package with electron-builder
npm run build

# Output:
# dist/Pyxenia-0.1.0.dmg          (macOS)
# dist/Pyxenia Setup 0.1.0.exe    (Windows)
# dist/Pyxenia-0.1.0.AppImage     (Linux)
```

### Add an app icon (required for production builds)

Place a `icon.png` (512×512px) in the `public/` folder. electron-builder will auto-convert it:
- macOS: `.icns`
- Windows: `.ico`
- Linux: `.png`

---

## Publishing a release

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will automatically:
1. Build for all 3 platforms
2. Create a GitHub Release with the binaries attached

---

## Adding features

### New IPC command (Node ↔ React)

1. Add `ipcMain.handle('your-command', (_, args) => { ... })` in `electron/main.js`
2. Expose it in `electron/preload.js`: `yourCommand: (args) => ipcRenderer.invoke('your-command', args)`
3. Call it in React: `window.pyxenia.yourCommand(args)`

### New component

1. Create `src/components/YourComponent.js` + `YourComponent.css`
2. Import and use it where needed
3. If it needs settings, use `useContext(SettingsContext)`
4. If it needs keyboard shortcuts, use `useKeyboardShortcuts([...])`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `python3: command not found` | Install Python 3 and ensure it's in PATH, or set a custom path in Settings |
| Blank white screen on startup | Check DevTools console for React errors (`npm run dev` shows them automatically) |
| `venv` creation fails | Ensure Python has the `venv` module: `python3 -m ensurepip --upgrade` |
| Packages not installing | Open Package Manager → check the output log for pip errors |
| App won't start after `npm run dev` | Kill any existing process on port 3000: `lsof -ti:3000 | xargs kill` |
