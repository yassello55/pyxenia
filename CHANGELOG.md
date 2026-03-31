# Changelog

## [0.1.0] — Advanced MVP

### Added
**Core**
- Project creation with isolated Python `venv` per project (auto-created in background)
- Script editor with real **syntax highlighting** (keywords, strings, comments, builtins, decorators)
- Line numbers synchronized with editor scroll
- One-click **Run** button with live stdout/stderr streaming
- **Stop** button to kill running processes mid-execution
- Ctrl+S / Cmd+S save with unsaved indicator dot

**Output Console**
- Live streaming output with auto-scroll
- **Search output** with match highlighting (Ctrl+F)
- Filter by errors only
- **Export output** to .txt file
- Manual scroll pauses auto-scroll; reaching bottom resumes it

**Package Manager (EnvManager)**
- Full modal UI for managing per-project packages
- Quick-install grid for 8 popular packages (pandas, numpy, requests, etc.)
- Install any package by name with live pip output log
- **List installed packages** with version numbers
- **Uninstall packages** with one click
- Filter installed packages by name
- Open project folder in system explorer

**Auto-detect imports**
- Scans your script for `import` statements
- Filters out Python builtins automatically
- One-click install of all detected third-party packages

**Input file**
- Attach any data file (CSV, JSON, TXT, XLSX…) — passed as `sys.argv[1]`
- **Drag & drop** a `.py` file to load code directly into editor
- **Drag & drop** a data file to set it as input

**Run History**
- Per-script run history tracking
- Preview first line of output per run
- Click any historical run to restore its output in the console

**Settings**
- Font size stepper (10–22px)
- Tab size selector (2/4/8 spaces)
- Toggle syntax highlighting on/off
- Toggle auto-save on run
- Max output lines cap (200/500/1k/5k)
- Custom Python path
- Persist across sessions via localStorage
- Reset to defaults

**Keyboard Shortcuts**
- `Ctrl/Cmd + S` — Save script
- `Ctrl/Cmd + Enter` — Run script
- `Ctrl/Cmd + K` — Clear output
- `Ctrl/Cmd + H` — Toggle run history
- `Ctrl/Cmd + ,` — Open settings
- `Ctrl/Cmd + F` — Search output (when output is focused)
- `Tab` — Insert spaces in editor (respects tab-size setting)

**About Modal**
- Keyboard shortcut reference sheet
- Open source / GitHub link

**CI/CD**
- GitHub Actions build for Windows (.exe), macOS (.dmg), Linux (.AppImage)
- Auto-release on git tag push
