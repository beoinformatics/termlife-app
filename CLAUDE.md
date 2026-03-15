# TermLife — PixiJS GPU-Accelerated Terminal

## Architecture

Electron app with PixiJS rendering and @xterm/headless as ANSI state machine.

```
src/
├── main/           # Electron main process
│   ├── index.ts    # BrowserWindow, IPC handlers
│   └── ptyManager.ts  # node-pty spawn/IO/resize
├── preload/
│   └── index.ts    # contextBridge pty API
└── renderer/
    ├── index.html
    └── src/
        ├── main.ts              # PixiJS app init, wiring
        ├── terminal/
        │   ├── TerminalEngine.ts  # @xterm/headless wrapper + cell sync
        │   ├── CellGrid.ts       # Text cell pool with dirty tracking
        │   ├── CursorRenderer.ts  # Blinking cursor
        │   ├── InputHandler.ts    # Keyboard → PTY escape sequences
        │   ├── SelectionManager.ts # Mouse text selection
        │   └── ScrollbackManager.ts # Scrollback buffer + scrollbar
        ├── effects/
        │   ├── CRTFilter.ts      # GLSL scanlines, glow, barrel distortion
        │   └── MatrixRain.ts     # Falling glyph animation
        └── tabs/
            ├── TabManager.ts     # Multi-tab state management
            ├── TabBar.ts         # PixiJS-rendered tab bar with emoticons
            ├── Dashboard.ts      # Grid overview of all tabs
            ├── AttentionScorer.ts # AI attention scoring
            └── SplitPane.ts      # Split pane layouts (single/vertical/horizontal/quad)
```

## Key Commands

- `npm run dev` — Start in development mode (electron-vite dev server)
- `npm run build` — Production build
- `npm run typecheck` — TypeScript type checking

## Keyboard Shortcuts

### Tab Management
- `Cmd+T` / `Ctrl+T` — New tab
- `Cmd+W` / `Ctrl+W` — Close tab
- `Cmd+1-9` / `Ctrl+1-9` — Switch to tab N
- `Shift+Cmd+[` / `Shift+Ctrl+[` — Previous tab (cycles)
- `Shift+Cmd+]` / `Shift+Ctrl+]` — Next tab (cycles)
- `Ctrl+Tab` — Smart tab switching (see below)

#### Smart Tab Switching (Ctrl+Tab)
Intelligently switches tabs based on current tab state:
- **If current tab is idle/running/error**: Switches to the tab with lowest index that is **awaiting input** (`running-input`). If none available, switches to next **idle** tab. If none, switches to next **running** tab.
- **If current tab is awaiting input**: Switches to the next tab also awaiting input. If no other input-awaiting tabs exist, nothing happens.
- `Ctrl+Tab` — Smart tab switching (see below)

#### Smart Tab Switching (Ctrl+Tab)
Intelligently switches tabs based on current tab state:
- **If current tab is idle/running/error**: Switches to the tab with lowest index that is **awaiting input** (`running-input`). If none available, switches to next **idle** tab. If none, switches to next **running** tab.
- **If current tab is awaiting input**: Switches to the next tab also awaiting input. If no other input-awaiting tabs exist, nothing happens.

### Effects
- `Ctrl+Shift+K` — Toggle Semi-Markdown mode
- `Ctrl+Shift+C` — Toggle CRT filter
- `Ctrl+Shift+M` — Toggle Matrix rain

### Scrollback Buffer
- `Shift+PageUp` — Scroll up 5 lines
- `Shift+PageDown` — Scroll down 5 lines
- `Cmd+Home` / `Ctrl+Home` — Jump to top of scrollback
- `Cmd+End` / `Ctrl+End` — Jump to bottom (latest output)
- Mouse wheel — Scroll through history

### Copy/Paste
- `Cmd+C` / `Ctrl+Shift+C` — Copy selection to clipboard
- `Cmd+V` / `Ctrl+Shift+V` — Paste from clipboard

## Split Panes

Each tab can have multiple sessions in different layouts:

| Button | Layout | Description |
|--------|--------|-------------|
| **+** | Single | One terminal per tab |
| **⧧** | Vertical | Two sessions side-by-side |
| **⧤** | Horizontal | Two sessions stacked |
| **⊞** | Quad | Four sessions in 2×2 grid |

Each pane runs an independent PTY. Keyboard input broadcasts to all panes in the active tab.

Click the tab bar buttons to create a new tab with the desired layout.

## Split Panes

Click the buttons to the right of the tabs to create split layouts:

| Button | Layout | Description |
|--------|--------|-------------|
| `+` | Single | One terminal per tab (default) |
| `⧧` | Vertical | Two terminals side-by-side |
| `⧤` | Horizontal | Two terminals stacked |
| `⊞` | Quad | Four terminals in 2×2 grid |

Each pane runs an independent PTY. Keyboard input is broadcast to all panes in the active tab.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| pixi.js v8 | GPU-accelerated 2D rendering |
| @xterm/headless | ANSI parser + terminal state (no DOM) |
| node-pty | PTY spawning in main process |
| electron-vite | 3-target Vite build (main/preload/renderer) |

## Testing — TDD Required

All new features and bug fixes MUST follow Test-Driven Development (Red-Green-Refactor):

1. **RED** — Write a failing test first
2. **GREEN** — Write minimal code to make it pass
3. **REFACTOR** — Clean up while keeping tests green

Use `/oh-my-claudecode:tdd` to activate the TDD workflow skill when starting any implementation work.

- **Framework:** Vitest (`npm run test`, `npm run test:watch`, `npm run test:coverage`)
- **Test location:** `src/**/__tests__/**/*.test.ts` (colocated with source)
- **Coverage target:** 80%+ for all new code
- **Mock PixiJS:** Tests must not depend on PixiJS runtime — mock Container, Graphics, Text etc. (see existing tests in `terminal/__tests__/` for patterns)
- **Test pure logic separately:** Extract parsers, algorithms, and data transforms into testable pure functions

## Development Notes

- CellGrid uses individual Text objects per cell with dirty tracking
- CRT filter is a custom GLSL shader via PixiJS Filter API
- The renderer never touches the DOM directly — everything is PixiJS
- PTY data flows: node-pty → IPC → @xterm/headless → CellGrid → PixiJS
