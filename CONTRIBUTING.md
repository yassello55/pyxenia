# Contributing to Pyxenia

Thanks for your interest! Here's how to get started.

## Setup

```bash
git clone https://github.com/your-username/pyxenia.git
cd pyxenia
npm install
npm run dev
```

## Project layout

```
electron/main.js      ← All Node.js / Python process logic lives here
electron/preload.js   ← IPC bridge (what React can call)
src/components/       ← All React UI components
```

## Key rules

- All Python execution happens in `electron/main.js` via `child_process.spawn`
- React never talks to Node directly — always goes through `window.pyxenia.*` (defined in preload.js)
- Each project stores data under `~/.pyxenia/projects/<id>/`

## Adding a feature

1. If it needs filesystem/process access → add an `ipcMain.handle` in `main.js` and expose it in `preload.js`
2. If it's UI only → add/edit a component in `src/components/`
3. Keep CSS co-located with the component (`.css` file same name)

## Submitting a PR

- One feature per PR
- Include a short description of what changed and why
- Screenshots welcome for UI changes
