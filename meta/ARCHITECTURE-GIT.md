# TermLife Git View — Architecture

## 1. Data Layer — Git via IPC, Not PTY

The terminal PTY is the wrong channel for structured git data. Instead:

```
src/main/gitManager.ts        ← New: shells out to `git` CLI with structured flags
src/preload/index.ts           ← Extend contextBridge with window.gitAPI
```

**gitManager.ts** exposes functions like:
- `status()` → parsed file list with states (modified/staged/untracked)
- `log(n)` → structured commit objects (hash, author, message, refs)
- `diff(file?)` → hunks with +/- lines
- `branches()` → branch list with current marker
- `stashList()` → stash entries

All return **JSON**, not raw text. The renderer never parses git output directly.

**File watcher** in main process watches `.git/HEAD`, `.git/index`, and the working tree — pushes `git-state-changed` events to renderer via IPC, so the view stays live without polling.

---

## 2. View Layer — Follow the Dashboard/HistoryView Pattern

```
src/renderer/src/git/
├── GitView.ts              # Top-level Container, toggle/resize/update
├── zones/
│   ├── WorkingZone.ts      # "Your Changes" — file tiles
│   ├── StagingZone.ts      # "Ready to Commit" — file tiles
│   └── HistoryZone.ts      # "Saved History" — commit nodes
├── panels/
│   ├── FileMap.ts           # Treemap of changed files (color/size coded)
│   ├── SymbolDiff.ts        # Tree-sitter structural diff (Phase 2)
│   └── BranchGraph.ts       # Railroad track branch visualization
├── components/
│   ├── FileTile.ts          # Single file thumbnail (draggable)
│   ├── CommitNode.ts        # Single commit circle on branch graph
│   ├── SafetyShield.ts      # Green/yellow/orange/red indicator
│   └── PreviewOverlay.ts    # "What Will Happen" dry-run preview
└── GitDataService.ts        # Calls window.gitAPI, caches, emits events
```

**GitView** follows the exact same lifecycle as Dashboard:
- `container: Container` added to `app.stage`
- `toggle()` / `show()` / `hide()` / `handleResize()` / `update()`
- Registered in CommandRegistry as `git:toggle` with `Ctrl+Shift+G`
- Added to the View menu

---

## 3. The Three Zones — Layout Strategy

The three zones sit in a horizontal `Container` that flexes to fill the viewport:

```
┌──────────────────────────────────────────────────────┐
│  TabBar (existing, stays visible)                    │
├────────────┬────────────┬────────────────────────────┤
│  Working   │  Staging   │  History (scrollable)      │
│  Zone      │  Zone      │                            │
│            │            │  ┌─────────────────────┐   │
│  [tiles]   │  [tiles]   │  │  BranchGraph        │   │
│            │            │  │  (railroad tracks)   │   │
│            │            │  └─────────────────────┘   │
├────────────┴────────────┴────────────────────────────┤
│  SafetyShield  │  FileMap (collapsible bottom panel) │
└──────────────────────────────────────────────────────┘
```

- Working and Staging zones get ~20% width each
- History zone gets ~60% and is horizontally scrollable
- FileMap is a collapsible bottom panel (like ProductivityBar)
- SafetyShield is a persistent small element in the corner

---

## 4. Interaction Model

**Drag-to-stage** uses PixiJS's built-in event system (already used in FileBrowser):
- `FileTile` gets `eventMode = 'static'`, `cursor = 'pointer'`
- Drag from Working → Staging = `git add <file>`
- Drag from Staging → Working = `git restore --staged <file>`
- Commands execute via `window.gitAPI`, then the file watcher triggers a state refresh

**Click interactions:**
- Click file tile → expand SymbolDiff panel (or inline diff initially)
- Click commit node → highlight changed files in FileMap
- Right-click → context menu (blame, log, checkout)

**Keyboard:**
- Arrow keys navigate between zones/files
- Enter = stage/unstage (context-dependent)
- `c` = open commit message input
- `Space` = preview diff

---

## 5. Branch Graph — PixiJS Graphics

The branch graph uses `Graphics` objects for track curves (already used for tab borders and effects):

```typescript
// Each branch = a colored path drawn with Graphics
const track = new Graphics()
track.moveTo(startX, y)
track.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, y)  // Fork/merge curves
track.stroke({ width: 3, color: branchColor })

// Commits = circles positioned along tracks
const node = new Graphics()
node.circle(x, y, 6)
node.fill(authorColor)
```

Smooth pan/zoom via container transforms (same pattern as Dashboard grid).

---

## 6. Phased Implementation

| Phase | What | Effort |
|-------|------|--------|
| **1** | gitManager + IPC + GitView shell (toggle, three zones with file tiles, stage/unstage) | Core foundation |
| **2** | BranchGraph (railroad tracks), commit nodes, FileMap treemap | Visual identity |
| **3** | Inline diff viewer (line-based first, not tree-sitter yet) | Usability |
| **4** | Safety shield, "What Will Happen" previews | Safety layer |
| **5** | Tree-sitter SymbolDiff, blame heat map | Expert features |
| **6** | Interactive rebase, reflog, bisect, stash shelf | Power tools |

---

## 7. Key Architectural Decisions

- **No new dependencies for Phase 1-4.** PixiJS Graphics + Text handles everything. Tree-sitter (`web-tree-sitter`) added only in Phase 5.
- **Git data via IPC, not PTY** — keeps the terminal sessions clean and git data structured.
- **GitView coexists with terminals** — toggling hides terminals but doesn't destroy them (same as Dashboard).
- **GitDataService as single source of truth** — caches git state, emits change events, debounces file watcher triggers. All zone/panel components subscribe to it rather than calling git directly.
- **Theme-aware** — all colors come from `themeManager.theme`, so the git view matches whatever terminal theme is active.
- **Config-persisted** — friendly labels toggle, expert mode toggle, panel sizes saved in AppConfig (extend the existing config schema).

The existing patterns (CommandRegistry, Container-based views, IPC bridge, ticker loop, config system) mean there's almost no new infrastructure needed — the Git View plugs into the same slots as Dashboard, HistoryView, and FileBrowser.
