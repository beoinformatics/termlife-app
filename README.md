# TermLife

A terminal emulator for the vibe coding era. TermLife makes the terminal visually expressive — CRT effects, matrix rain, bubble physics, and font-aware markdown rendering — all GPU-accelerated. Built with Electron and PixiJS for people who want their terminal to feel alive, not just fast.

![TermLife Screenshot](assets/termlife-markdown.png)

## Features

- **Semi-Markdown mode** — Font-aware markdown rendering with bold, italic, headers, and more — right in your terminal
- **CRT filter** — Scanlines, phosphor glow, and barrel distortion via custom GLSL shaders
- **Bubble effects** — Physics-based particle effects powered by Matter.js
- **Matrix rain** — Falling glyph animation overlay
- **AI attention scoring** — Tabs scored by activity for intelligent switching
- **Smart tab switching** — Ctrl+Tab jumps to the tab that needs your attention most
- **Split panes** — Single, vertical, horizontal, and quad layouts
- **GPU-rendered** — Every cell rendered on the GPU, not the DOM
- **Scrollback buffer** — Full history with mouse wheel and keyboard navigation

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
git clone https://github.com/beoinformatics/termlife-app.git
cd termlife-app
npm install
npm run dev
```

### Build

```bash
npm run build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+T` | New tab |
| `Cmd/Ctrl+W` | Close tab |
| `Cmd/Ctrl+1-9` | Switch to tab N |
| `Ctrl+Tab` | Smart tab switch |
| `Ctrl+Shift+K` | Toggle Semi-Markdown mode |
| `Ctrl+Shift+C` | Toggle CRT filter |
| `Ctrl+Shift+M` | Toggle Matrix rain |
| `Shift+PageUp/Down` | Scroll up/down |
| `Cmd/Ctrl+C` | Copy selection |
| `Cmd/Ctrl+V` | Paste |

## Architecture

TermLife uses [@xterm/headless](https://github.com/xtermjs/xterm.js) as the ANSI state machine and [PixiJS v8](https://pixijs.com/) for all rendering. PTY processes are managed via [node-pty](https://github.com/niconicomern/node-pty) in Electron's main process.

```
PTY (node-pty) → IPC → @xterm/headless → CellGrid → PixiJS GPU rendering
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## License

[MIT](LICENSE) — Copyright (c) 2026 Eckart Bindewald and contributors
