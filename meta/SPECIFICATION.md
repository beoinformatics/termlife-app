# TermLife Technical Specification

## Overview

TermLife is a GPU-accelerated terminal emulator built with Electron, PixiJS, and @xterm/headless. It features multi-tab support with emotional state indicators, split-pane layouts, visual effects, and AI-powered attention scoring.

---

## System Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Electron | Desktop application shell |
| Renderer | PixiJS v8 | GPU-accelerated 2D rendering |
| Terminal Logic | @xterm/headless | ANSI parsing, terminal state machine |
| PTY | node-pty | Native pseudo-terminal spawning |
| Build Tool | electron-vite | 3-target Vite build (main/preload/renderer) |
| Language | TypeScript | Type-safe development |

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  index.ts    │  │ ptyManager.ts│  │  IPC Handlers    │  │
│  │  (BrowserWin)│  │  (node-pty)  │  │  (create/write/  │  │
│  │              │  │              │  │   resize/kill)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         │                 │                                 │
│         └─────────────────┘                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │ IPC (contextBridge)
┌─────────────────────────┼───────────────────────────────────┐
│              Electron Renderer Process                    │
│  ┌──────────────────────┼───────────────────────────────┐  │
│  │                      ▼                               │  │
│  │  ┌─────────────┐  ┌────────────┐  ┌────────────────┐  │  │
│  │  │   main.ts   │  │  TabBar    │  │   Dashboard    │  │  │
│  │  │  (PixiJS    │  │  (PixiJS   │  │   (PixiJS      │  │  │
│  │  │   init)     │  │   tabs)    │  │   overview)    │  │  │
│  │  └──────┬──────┘  └────────────┘  └────────────────┘  │  │
│  │         │                                            │  │
│  │  ┌──────┴─────────────────────────────────────────┐   │  │
│  │  │              TabManager                       │   │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐       │   │  │
│  │  │  │ SplitPane│  │ SplitPane│  │ SplitPane│       │   │  │
│  │  │  │ (Tab 1) │  │ (Tab 2) │  │ (Tab 3) │       │   │  │
│  │  │  └───┬─────┘  └─────────┘  └─────────┘       │   │  │
│  │  │      │                                         │   │  │
│  │  │  ┌───┴───┐  ┌──────────┐  ┌──────────┐      │   │  │
│  │  │  │Pane 1 │  │  Pane 2  │  │  Pane 3  │      │   │  │
│  │  │  │┌─────┐│  │ ┌──────┐ │  │ ┌──────┐ │      │   │  │
│  │  │  ││Cell ││  │ │ Cell │ │  │ │ Cell │ │      │   │  │
│  │  │  ││Grid ││  │ │ Grid │ │  │ │ Grid │ │      │   │  │
│  │  │  ││(Pixi)││  │ │(Pixi)│ │  │ │(Pixi)│ │      │   │  │
│  │  │  │└─────┘│  │ └──────┘ │  │ └──────┘ │      │   │  │
│  │  │  │┌─────┐│  │ ┌──────┐ │  │ ┌──────┐ │      │   │  │
│  │  │  ││xterm││  │ │xterm │ │  │ │xterm │ │      │   │  │
│  │  │  ││headl││  │ │headl │ │  │ │headl │ │      │   │  │
│  │  │  │└─────┘│  │ └──────┘ │  │ └──────┘ │      │   │  │
│  │  │  └───────┘  └──────────┘  └──────────┘      │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │   CRTFilter  │  │  MatrixRain  │  │ Attention   │  │  │
│  │  │   (GLSL)     │  │  (GLSL)      │  │ Scorer      │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### PTY Data Flow

```
Shell Output:
shell → node-pty → IPC → renderer → @xterm/headless → cell grid → PixiJS Text

Keyboard Input (normal mode):
key event → InputHandler → IPC → node-pty → shell

Keyboard Input (command mode, `:` prompt):
key event → InputHandler → local buffer → CommandRegistry → app action
```

### Render Loop

```
1. App ticker fires (60 FPS target)
2. Active SplitPane.update() called
3. Each TerminalEngine syncs @xterm/headless state to CellGrid
4. CellGrid flushes dirty cells (only changed Text objects updated)
5. CursorRenderer applies blink state
6. PixiJS renders the scene
7. CRTFilter/MatrixRain update if enabled
```

---

## Module Specifications

### Main Process (`src/main/`)

#### `index.ts`
- Creates `BrowserWindow` with `contextIsolation: true`
- Registers IPC handlers for PTY operations
- Loads renderer via Vite dev server or production build

#### `ptyManager.ts`
- Manages multiple PTY sessions via `node-pty`
- Handles spawn, write, resize, kill operations
- Forwards data/exit events via IPC

### Preload (`src/preload/`)

#### `index.ts`
- Exposes `ptyAPI` via `contextBridge`
- Methods: `create`, `write`, `resize`, `kill`, `onData`, `onExit`
- Type-safe IPC bridge between main and renderer

### Renderer (`src/renderer/src/`)

#### `main.ts`
- Initializes PixiJS `Application`
- Creates `TabManager`, `TabBar`, `Dashboard`
- Registers global keyboard shortcuts
- Manages CRT filter and Matrix rain toggles
- Main render loop coordination

#### Terminal Module (`terminal/`)

| File | Responsibility |
|------|----------------|
| `TerminalEngine.ts` | @xterm/headless wrapper, PTY data consumption, cell synchronization |
| `CellGrid.ts` | Pre-allocated Text pool per cell, dirty tracking, color palette (256 colors) |
| `CursorRenderer.ts` | Blinking cursor graphics, position tracking |
| `InputHandler.ts` | Keyboard event → escape sequence translation; inline command mode (`:` prompt) |
| `SelectionManager.ts` | Mouse selection, word/line selection, clipboard integration |
| `TerminalStateMachine.ts` | State management for terminal modes |

**CellGrid Details:**
- Fixed cell size: 9px width × 18px height (monospace)
- Each cell: `Text` object with `TextStyle`
- Dirty tracking: Only modified cells updated each frame
- Attributes: fg/bg color (256 palette), bold, italic

**Color Palette:**
- Standard 16 ANSI colors
- 216-color cube (6×6×6)
- 24 grayscale levels

#### Tabs Module (`tabs/`)

| File | Responsibility |
|------|----------------|
| `TabManager.ts` | Tab lifecycle (create/switch/close), active tab tracking |
| `TabBar.ts` | PixiJS-rendered tab bar, emoji state indicators, layout buttons |
| `SplitPane.ts` | Multi-pane layouts (single/vertical/horizontal/quad), PTY management |
| `AttentionScorer.ts` | AI scoring based on error rate, staleness, output patterns |
| `Dashboard.ts` | Grid overview of all tabs with live previews |

**Tab State Emojis:**

| State | Emoji | Trigger |
|-------|-------|---------|
| idle | ⬤ | No recent activity |
| running | ⚙️ | Process detected running |
| success | ✅ | Command completed successfully |
| error | ❌ | Error keywords detected in output |
| attention | 🔔 | High attention score from AI |

**Split Layouts:**

| Layout | Symbol | Description |
|--------|--------|-------------|
| single | + | One terminal per tab |
| vertical | ⧧ | Two terminals side-by-side |
| horizontal | ⧤ | Two terminals stacked |
| quad | ⊞ | Four terminals in 2×2 grid |

#### Effects Module (`effects/`)

| File | Responsibility |
|------|----------------|
| `CRTFilter.ts` | GLSL shader with scanlines, phosphor glow, barrel distortion, vignette, flicker |
| `MatrixRain.ts` | Falling Japanese/hex glyph animation with fade trails |

---

## Keyboard Shortcuts

### Tab Management

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + T` | New tab (single layout) |
| `Cmd/Ctrl + W` | Close active tab |
| `Cmd/Ctrl + 1-9` | Switch to tab N |
| `Shift + Cmd/Ctrl + [` | Previous tab (cycles) |
| `Shift + Cmd/Ctrl + ]` | Next tab (cycles) |
| `Cmd/Ctrl + Shift + D` | Toggle Dashboard |

### Terminal Operations

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + C` | Copy selection (if active), else SIGINT |
| `Cmd/Ctrl + V` | Paste from clipboard |
| `Cmd/Ctrl + Shift + C` | Copy to clipboard (when selection exists) |
| `Cmd/Ctrl + Shift + V` | Paste from clipboard |
| `Ctrl + Shift + C` | Toggle CRT filter (when no selection) |
| `Ctrl + Shift + M` | Toggle Matrix rain |
| `Escape` | Clear selection |

### Selection

| Action | Behavior |
|--------|----------|
| Click + Drag | Select text range |
| Double-click | Select word |
| Triple-click | Select entire line |

---

## Interface Definitions

### PTY API (Preload Bridge)

```typescript
interface PtyAPI {
  create(id: string, shell?: string): Promise<{ success: boolean; pid?: number; error?: string }>
  write(id: string, data: string): Promise<{ success: boolean; error?: string }>
  resize(id: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }>
  kill(id: string): Promise<{ success: boolean; error?: string }>
  onData(id: string, callback: (id: string, data: string) => void): void
  offData(id: string): void
  onExit(id: string, callback: (id: string, exitCode: number) => void): void
  offExit(id: string): void
  removeAllListeners(): void
}
```

### Tab Interface

```typescript
type TabState = 'idle' | 'running' | 'success' | 'error' | 'attention'
type SplitLayout = 'single' | 'vertical' | 'horizontal' | 'quad'

interface Tab {
  id: string
  title: string
  state: TabState
  splitPane: SplitPane
  layout: SplitLayout
}
```

### Attention Score

```typescript
interface AttentionScore {
  score: number        // 0-1, higher = needs attention
  reasons: string[]    // Why this score was assigned
  errorRate: number    // Errors per minute
  stalenessMs: number  // Ms since last output
}
```

---

## Performance Characteristics

| Metric | Target | Implementation |
|--------|--------|----------------|
| Render FPS | 60 | PixiJS ticker, dirty cell tracking |
| Memory/cell | ~200 bytes | Pre-allocated Text objects |
| Scrollback | 1000 lines | @xterm/headless buffer |
| PTY latency | <16ms | Direct IPC, no buffering |
| Resize delay | 100ms debounce | PTY resize throttling |

---

## Build System

### Configuration Files

| File | Purpose |
|------|---------|
| `electron.vite.config.ts` | 3-target Vite configuration |
| `tsconfig.json` | Base TypeScript config |
| `tsconfig.node.json` | Node.js (main/preload) types |
| `tsconfig.web.json` | Renderer (DOM) types |

### Scripts

```bash
npm run dev      # Development mode with HMR
npm run build    # Production build for all targets
npm run preview  # Preview production build
npm run typecheck # TypeScript --noEmit check
```

### Output Structure

```
out/
├── main/
│   └── index.js          # Main process bundle
├── preload/
│   └── index.js          # Preload script bundle
└── renderer/
    ├── index.html        # HTML entry
    └── assets/
        ├── index.js      # Renderer bundle
        └── index.css     # Styles
```

---

## History & Command Language System

### TermLife Command Language (TCL)

Every UI action in TermLife has a canonical text representation using bracket syntax:

```
[category:action arguments]
```

Categories: `tab`, `split`, `theme`, `crt`, `matrix`, `dashboard`, `history`, `scroll`

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full command registry and design rationale.

### Per-Tab History

Each tab maintains an ephemeral, in-memory history of user actions:

```typescript
interface HistoryEntry {
  timestamp: number
  type: 'shell' | 'app'
  command: string
}
```

**Shell command capture**: User input lines are recorded only when the PTY has no child processes (shell is at the prompt). Interactive programs (vim, node REPL, etc.) are excluded by design.

**App command capture**: All app commands log to history regardless of entry point (mouse, keyboard shortcut, or command palette).

History is:
- **Ephemeral** — not persisted to disk
- **Tab-isolated** — never shared across tabs
- **Append-only** — timestamped, chronological

### Command Mode (Inline Palette)

Activated via `Ctrl+Shift+P` / `Cmd+Shift+P`. Instead of a floating overlay, the terminal prompt changes from `>` to `:`, indicating that the next input line is an app command rather than a shell command.

**Behavior:**
- Pressing `Cmd/Ctrl+Shift+P` enters command mode — a `:` prompt appears on a new line
- Keystrokes are collected locally and echoed to the terminal (not sent to the PTY)
- `Enter` executes the command and exits command mode
- `Escape` cancels and exits command mode
- `Backspace` and `Ctrl+U` (kill line) work for editing
- Commands are matched first as exact TCL IDs (e.g. `theme:set dracula`), then by fuzzy search against all registered commands

**Examples:**
```
:crt:toggle          → Toggle CRT filter
:theme:set dracula   → Switch to Dracula theme
:theme:list          → Print available themes
:tab:new             → Open new tab
:matrix              → Fuzzy-matches matrix:toggle
```

Every app action has three entry points:
1. Mouse click
2. Keyboard shortcut (if bound)
3. Command mode `:` prompt (always available)

### History View

Per-tab view toggled via shortcut or `[history:toggle]`. Displays timestamped log with shell commands in normal text color and app commands in accent/dim color. Text is selectable for copy-paste.

### Session Replay

Users can save history to a file and replay it on startup:

```bash
termlife -f replay.txt
termlife --replay replay.txt
```

Replay sends shell commands to the PTY sequentially (waiting for idle between each) and executes app commands immediately. Lines starting with `#` are treated as comments.

### New Modules

| File | Responsibility |
|------|----------------|
| `history/TabHistory.ts` | Per-tab history log (append, query, export) |
| `history/HistoryView.ts` | PixiJS-rendered history panel |
| `history/CommandPalette.ts` | (Legacy) Floating command input overlay — replaced by inline `:` command mode in `InputHandler.ts` |
| `history/CommandRegistry.ts` | Registered app commands with metadata |

---

## Future Roadmap

### Phase 9: History & Command Language
- [ ] TabHistory class with shell command capture
- [ ] App command registry with TCL syntax
- [ ] Command palette (Ctrl+Shift+P)
- [ ] History view per tab
- [ ] Replay file parser and executor
- [ ] CLI flag `-f` / `--replay` for session replay

### Phase 10: Configuration
- [ ] Font selection UI
- [ ] Font size configuration
- [ ] Color theme support (Solarized, Dracula, etc.)

### Phase 11: AI Auto-Mode
- [ ] Automatic tab switching based on attention scores
- [ ] Configurable focus policies
- [ ] LLM integration for command relevance

### Phase 12: Headless Mode
- [ ] Express server in main process
- [ ] REST API for tab control
- [ ] Screenshot capture for demos

### Phase 13: Advanced Features
- [ ] Scrollback buffer with mouse wheel
- [ ] Search in terminal output
- [ ] Focus management for split panes (click to focus)
- [ ] Session persistence/restore

---

## Dependencies

```json
{
  "dependencies": {
    "@xterm/headless": "^5.5.0",
    "node-pty": "^1.0.0",
    "pixi.js": "^8.6.6"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.0.0"
  }
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-03-04 | Initial release with tabs, split panes, effects, copy/paste |
