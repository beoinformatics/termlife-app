# TermLife: Implementation Plan

## Status: COMPLETE ✅

All phases have been implemented and the build succeeds.

---

## Phase 1: Project Scaffold ✅
- [x] `package.json` with electron-vite, pixi.js, @xterm/headless, node-pty
- [x] `electron.vite.config.ts` for 3-target build (main/preload/renderer)
- [x] `tsconfig.json` + `tsconfig.node.json` + `tsconfig.web.json`
- [x] `src/renderer/index.html` minimal page
- [x] Verify: `npm run dev` opens Electron window with PixiJS canvas

---

## Phase 2: PTY + IPC ✅
- [x] `src/main/index.ts` — BrowserWindow creation, IPC handler registration
- [x] `src/main/ptyManager.ts` — node-pty spawn, data/exit forwarding
- [x] `src/preload/index.ts` — contextBridge with create/write/resize/kill/onData/onExit
- [x] Rebuild node-pty native module for Electron (`electron-rebuild`)
- [x] Verify: PTY created on window load, shell output arrives in renderer console.log

---

## Phase 3: Terminal Rendering Engine ✅
- [x] `src/renderer/src/terminal/TerminalEngine.ts` — @xterm/headless wrapper, feeds PTY data, exposes cell grid
- [x] `src/renderer/src/terminal/CellGrid.ts` — pre-allocate cols×rows Text objects, dirty-track changes, flush to PixiJS each frame
- [x] `src/renderer/src/terminal/CursorRenderer.ts` — Graphics object, blink via ticker
- [x] `src/renderer/src/terminal/InputHandler.ts` — keyboard events → PTY escape sequences
- [x] 256-color palette support (standard 16 + 216 cube + 24 grayscale)
- [x] Bold/italic attribute rendering
- [x] Verify: Open app, see working shell rendered by PixiJS. Type commands, see output. Cursor blinks.

---

## Phase 4: Visual Effects ✅
- [x] `src/renderer/src/effects/CRTFilter.ts` — GLSL scanlines, phosphor glow, barrel distortion, vignette, flicker
- [x] `src/renderer/src/effects/MatrixRain.ts` — falling Japanese/hex glyphs with fade trail
- [x] Ctrl+Shift+C toggle for CRT filter
- [x] Ctrl+Shift+M toggle for Matrix rain
- [x] Verify: Toggle CRT mode, see scanlines and glow. Trigger Matrix rain animation.

---

## Phase 5: Tabs + Emoticons ✅
- [x] `src/renderer/src/tabs/TabManager.ts` — manage multiple TerminalEngine instances, show/hide containers
- [x] `src/renderer/src/tabs/TabBar.ts` — PixiJS-rendered tab bar with state emoji indicators
- [x] `src/renderer/src/tabs/AttentionScorer.ts` — AI attention scoring (error detection, staleness, error rate)
- [x] Cmd+T / Ctrl+T — new tab
- [x] Cmd+W / Ctrl+W — close tab
- [x] Cmd+1-9 / Ctrl+1-9 — switch to tab N
- [x] Click tab to switch, "+" button to create
- [x] Emoticon state indicators: ⬤ idle, ⚙️ running, ✅ success, ❌ error, 🔔 attention
- [x] Verify: Multiple tabs work, emoji state shows correctly

---

## Phase 6: Polish ✅
- [x] Resize handling — recompute cols/rows on window resize, resize PTY
- [x] `CLAUDE.md` with architecture docs, commands, shortcuts
- [x] Verify: `electron-vite build` succeeds for all 3 targets
- [x] Verify: `npm run dev` launches full app with all features

---

## Build Verification

```bash
# Development mode
npm run dev

# Production build
npm run build

# Type checking (note: stale out/ dir may cause TS6305 warnings)
npm run typecheck
```

---

## File Structure

```
termlife-app/
├── src/
│   ├── main/
│   │   ├── index.ts          # Electron main process
│   │   └── ptyManager.ts     # node-pty session management
│   ├── preload/
│   │   └── index.ts          # contextBridge API
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.ts       # PixiJS app initialization
│           ├── terminal/
│           │   ├── TerminalEngine.ts   # xterm.js + PixiJS bridge
│           │   ├── CellGrid.ts       # Text cell pool
│           │   ├── CursorRenderer.ts # Blinking cursor
│           │   └── InputHandler.ts    # Keyboard → PTY
│           ├── effects/
│           │   ├── CRTFilter.ts      # GLSL CRT effect
│           │   └── MatrixRain.ts     # Matrix rain animation
│           └── tabs/
│               ├── TabManager.ts     # Multi-tab state
│               ├── TabBar.ts         # PixiJS tab bar
│               └── AttentionScorer.ts # AI scoring
├── electron.vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Phase 7: Split Panes ✅
- [x] `src/renderer/src/tabs/SplitPane.ts` — SplitPane class managing multiple PTYs in layouts
- [x] Single, vertical (2 cols), horizontal (2 rows), quad (2×2) layouts
- [x] Tab bar buttons: + (single), ⧧ (vertical), ⧤ (horizontal), ⊞ (quad)
- [x] Each pane runs independent PTY with separate TerminalEngine
- [x] Dividers between panes
- [x] Resize handling for all layouts
- [x] Keyboard input broadcasts to all panes in active tab

## Phase 8: Selection / Copy-Paste ✅
- [x] `src/renderer/src/terminal/SelectionManager.ts` — Mouse selection with visual highlight overlay
- [x] Click and drag to select text
- [x] Double-click to select word, triple-click to select line
- [x] Copy to clipboard — Cmd/Ctrl+Shift+C (when selection exists)
- [x] Paste from clipboard — Cmd/Ctrl+Shift+V
- [x] Escape key clears selection
- [x] Selection synced with terminal cell content each frame
- [x] Integrated with SplitPane — copy/paste works on focused pane

## Phase 9: Dashboard Tab ✅
- [x] `src/renderer/src/tabs/Dashboard.ts` — Grid overview of all tabs with live previews
- [x] Show state emoticons (⬤ idle, ⚙️ running, ✅ success, ❌ error, 🔔 attention)
- [x] Terminal content preview from first pane of each tab
- [x] Click to focus tab, close button on each card
- [x] Keyboard shortcut: Cmd/Ctrl+Shift+D to toggle dashboard
- [x] Only updates when visible (performance optimization)
- [x] Responsive grid layout

## Phase 9: Dashboard Tab ✅
- [x] `src/renderer/src/tabs/Dashboard.ts` — Grid overview of all tabs with live previews
- [x] Show state emoticons (⬤ idle, ⚙️ running, ✅ success, ❌ error, 🔔 attention)
- [x] Terminal content preview from first pane of each tab
- [x] Click to focus tab, close button on each card
- [x] Keyboard shortcut: Cmd/Ctrl+Shift+D to toggle dashboard
- [x] Only updates when visible (performance optimization)
- [x] Responsive grid layout

## Phase 10: Scrollback Buffer ✅
- [x] `src/renderer/src/terminal/ScrollbackManager.ts` — Scrollback management with viewport tracking
- [x] 10,000 lines of scrollback history configured in xterm.js
- [x] Mouse wheel scrolling support
- [x] Visual scrollbar indicator with drag support
- [x] Auto-scroll to bottom on new output (unless manually scrolled)
- [x] Keyboard shortcuts: Shift+PageUp/PageDown to scroll, Cmd/Ctrl+Home/End to jump to top/bottom
- [x] Scrollback methods exposed through SplitPane and TabManager

## Future Phases (not yet started)
- [ ] Font selection / size configuration UI
- [ ] Color theme support (Solarized, Dracula, etc.)
- [ ] AI Auto-Mode — automatic tab switching based on attention scores
- [ ] Headless Mode — HTTP API for automation and demo generation
- [ ] Search in terminal output
- [ ] Focus management for split panes (click to focus specific pane)
