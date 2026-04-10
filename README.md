# ⚡ Pyxenia

> **Run Python scripts without a code editor — for everyone.**

Pyxenia is an open-source desktop app that lets anyone run Python scripts with zero setup. Paste code from an LLM, configure inputs, click **Run**, and see results instantly — no terminal, no VS Code, no fuss.

![Pyxenia Screenshot](./assets/screenshot.png)

---

## 🎯 Who is this for?

- People who get Python code from ChatGPT / Claude and don't know how to run it
- Analysts and researchers who want to process files without touching a terminal
- Anyone who wants a simple, portable Python launcher

---

## ✨ Features

| Feature | Description |
|---|---|
| 📁 **Projects** | Each project has its own isolated Python virtual environment |
| 📋 **Paste or import** | Paste code directly, drag-and-drop a `.py` file, or download it |
| ⚡ **One-click run** | Run your script with a single button (or `Ctrl+Enter`) |
| 📦 **Auto package detection** | Scans `import` statements, shows missing packages, installs with one click |
| 🔍 **Pre-run dependency check** | Warns about missing packages before running, not after |
| 🎛️ **Script arguments** | Full `sys.argv` support — define file or value args in an Inputs panel, auto-detected from code |
| 📂 **File picker** | Choose input files from your PC or directly from another script's output files |
| 🖥️ **Live output console** | See `stdout` and `stderr` in real time with color-coded output |
| 📄 **Output Files tab** | Browse, preview, and open files produced by your scripts |
| 🕓 **Run history** | Browse past runs with their full output |
| ✏️ **Syntax highlighting** | Color-coded Python editor with find bar (`Ctrl+F`) |
| 🤖 **AI assistant** | Built-in chat panel supporting Claude, GPT, and Gemini models |
| 🐛 **Debug with AI** | One-click: send the last error traceback to the AI assistant |
| 💾 **Auto-save** | Scripts are saved per-project and persist between sessions |
| 🔐 **API key manager** | Store provider keys locally — never sent anywhere except the AI provider |
| 🌍 **Environment manager** | View and manage each project's virtual environment and installed packages |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Python 3](https://www.python.org/) (must be in your PATH)

### Install & Run

```bash
git clone https://github.com/your-username/pyxenia.git
cd pyxenia
npm install
npm run dev
```

### Build for distribution

```bash
npm run build
```

Output is in the `dist/` folder — `.exe` installer for Windows, `.dmg` for macOS, `.AppImage` for Linux.

---

## 🎛️ Script Arguments

Scripts that use `sys.argv` are fully supported. Pyxenia auto-detects arguments from your code and shows them in the **Inputs** panel. You can also declare them explicitly at the top of your script:

```python
# args:
#  1: input_file (file) - CSV or Excel file to process
#  2: output_name (value) - Name for the output file

import sys
input_file = sys.argv[1]
output_name = sys.argv[2]
```

Argument types:
- **`file`** — opens a file picker (supports browsing project output files)
- **`value`** — a free-text input (string, number, etc.)

---

## 🤖 AI Assistant

The built-in chat panel connects to your preferred AI provider:

- **Anthropic Claude** (claude-opus-4, claude-sonnet-4, etc.)
- **OpenAI GPT** (gpt-4o, gpt-4.1, etc.)
- **Google Gemini** (gemini-2.0-flash, gemini-2.5-pro, etc.)

The assistant is aware of your active project, script, and configured inputs. It can edit your script directly — and always asks for confirmation before making changes.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) |
| UI framework | React 18 |
| Python runtime | System Python 3 + `venv` per project |
| Package manager | `pip` (auto-invoked) |
| AI providers | Anthropic, OpenAI, Google Generative AI |

---

## 📁 Project Structure

```
pyxenia/
├── electron/
│   ├── main.js           # Electron main process (file system, Python runner, IPC)
│   ├── preload.js        # Secure IPC bridge (contextBridge)
│   ├── llm.js            # AI provider layer (Claude, GPT, Gemini streaming)
│   ├── llmTools.js       # LLM tool definitions (edit-script, etc.)
│   ├── apiKeyStore.js    # Encrypted local API key storage
│   ├── fileParser.js     # Output file parser/preview helpers
│   └── envBus.js         # Virtual environment event bus
├── src/
│   ├── components/
│   │   ├── Sidebar.js          # Project navigation
│   │   ├── ProjectView.js      # Script list per project
│   │   ├── ScriptEditor.js     # Code editor, output console, inputs panel
│   │   ├── ChatPanel.js        # AI assistant chat
│   │   ├── HighlightedEditor.js# Syntax-highlighted code editor
│   │   ├── OutputConsole.js    # Live stdout/stderr console
│   │   ├── FilePreview.js      # Output file preview (CSV, JSON, text, image)
│   │   ├── RunHistory.js       # Past run browser
│   │   ├── EnvManager.js       # Virtual environment manager
│   │   ├── SettingsPanel.js    # App settings
│   │   └── WelcomeScreen.js    # Onboarding screen
│   ├── App.js
│   └── index.js
├── public/
│   └── index.html
└── package.json
```

---

## 🗺️ Roadmap

- [ ] Dark / light theme toggle
- [ ] Schedule / automate script runs
- [ ] Share projects as `.pyxenia` bundles
- [ ] Streamlit / web-output script support

---

## 🤝 Contributing

PRs welcome! Please open an issue first to discuss changes.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

**Made with ⚡ for everyone who ever got a Python script and had no idea how to run it.**
