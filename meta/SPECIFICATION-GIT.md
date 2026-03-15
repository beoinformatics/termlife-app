# TermLife Git View — Specification

## 1. Overview

The Git View is a full-screen PixiJS-rendered overlay that visualizes git repository state as a spatial, interactive experience. It toggles on/off like Dashboard, coexisting with terminal sessions without destroying them.

**Activation:** `Ctrl+Shift+G` or View menu → "Git View"

---

## 2. IPC API — `window.gitAPI`

Exposed via `contextBridge` in `preload/index.ts`. All methods are async and return structured JSON.

### 2.1 Status

```typescript
gitAPI.status(cwd: string): Promise<GitStatus>

interface GitStatus {
  branch: string               // Current branch name
  upstream: string | null      // Upstream tracking branch
  ahead: number                // Commits ahead of upstream
  behind: number               // Commits behind upstream
  detached: boolean            // HEAD detached?
  merging: boolean             // Mid-merge?
  rebasing: boolean            // Mid-rebase?
  files: GitFileStatus[]
}

interface GitFileStatus {
  path: string                 // Relative file path
  index: FileState             // State in index (staged)
  workingTree: FileState       // State in working tree
  renamed?: string             // Original path if renamed
}

type FileState = 'unmodified' | 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'ignored' | 'conflicted'
```

**Implementation:** `git status --porcelain=v2 --branch`

### 2.2 Log

```typescript
gitAPI.log(cwd: string, options?: LogOptions): Promise<GitCommit[]>

interface LogOptions {
  maxCount?: number            // Default: 50
  branch?: string              // Default: current branch
  all?: boolean                // All branches
}

interface GitCommit {
  hash: string                 // Full SHA
  shortHash: string            // First 7 chars
  author: string
  authorEmail: string
  date: string                 // ISO 8601
  message: string              // First line only
  body: string                 // Full message body
  refs: string[]               // Branch/tag names pointing here
  parents: string[]            // Parent commit hashes
}
```

**Implementation:** `git log --format=<custom> --decorate=short`

### 2.3 Diff

```typescript
gitAPI.diff(cwd: string, options?: DiffOptions): Promise<GitDiff[]>

interface DiffOptions {
  staged?: boolean             // Diff staged vs HEAD (default: unstaged)
  file?: string                // Specific file only
  commit?: string              // Diff against specific commit
}

interface GitDiff {
  path: string
  oldPath?: string             // If renamed
  status: FileState
  hunks: DiffHunk[]
  stats: { additions: number; deletions: number }
}

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string               // @@ line
  lines: DiffLine[]
}

interface DiffLine {
  type: 'context' | 'addition' | 'deletion'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}
```

**Implementation:** `git diff --unified=3 [--cached] [-- file]`

### 2.4 Branches

```typescript
gitAPI.branches(cwd: string): Promise<GitBranches>

interface GitBranches {
  current: string
  local: BranchInfo[]
  remote: BranchInfo[]
}

interface BranchInfo {
  name: string
  hash: string
  upstream?: string
  ahead: number
  behind: number
  lastCommitDate: string
}
```

**Implementation:** `git branch -vv --format=<custom>` + `git branch -r --format=<custom>`

### 2.5 Stash

```typescript
gitAPI.stashList(cwd: string): Promise<StashEntry[]>

interface StashEntry {
  index: number
  message: string
  date: string
  branch: string               // Branch stash was created on
}
```

**Implementation:** `git stash list --format=<custom>`

### 2.6 Mutation Commands

```typescript
gitAPI.stage(cwd: string, paths: string[]): Promise<void>
gitAPI.unstage(cwd: string, paths: string[]): Promise<void>
gitAPI.commit(cwd: string, message: string): Promise<string>    // Returns new commit hash
gitAPI.checkout(cwd: string, branch: string): Promise<void>
gitAPI.createBranch(cwd: string, name: string): Promise<void>
gitAPI.stash(cwd: string, message?: string): Promise<void>
gitAPI.stashPop(cwd: string, index?: number): Promise<void>
gitAPI.restore(cwd: string, paths: string[]): Promise<void>     // Discard working tree changes
```

### 2.7 Graph Data (for Branch Visualization)

```typescript
gitAPI.graph(cwd: string, options?: GraphOptions): Promise<GraphData>

interface GraphOptions {
  maxCount?: number            // Default: 100
  all?: boolean                // All branches (default: true)
}

interface GraphData {
  commits: GraphCommit[]
  branches: GraphBranch[]
}

interface GraphCommit {
  hash: string
  shortHash: string
  parents: string[]            // 0 = root, 1 = normal, 2+ = merge
  author: string
  date: string
  message: string
  column: number               // Assigned lane/column for rendering
  refs: string[]
}

interface GraphBranch {
  name: string
  head: string                 // Commit hash branch points to
  column: number               // Lane assignment
  color: number                // Hex color for rendering
  isCurrent: boolean
}
```

**Implementation:** `git log --all --format=<custom> --parents` + lane assignment algorithm in gitManager.

### 2.8 File Watcher Events

```typescript
// Main process watches .git directory and pushes events
gitAPI.onStateChanged(cwd: string, callback: () => void): void
gitAPI.offStateChanged(cwd: string): void
```

**Watched paths:**
- `.git/HEAD` — branch switch, detach
- `.git/index` — staging changes
- `.git/refs/` — new commits, branch create/delete
- `.git/MERGE_HEAD` — merge state
- `.git/rebase-merge/` — rebase state

Debounced at 300ms to batch rapid changes.

---

## 3. GitDataService — Client-Side Cache

Singleton in the renderer that wraps `window.gitAPI` with caching and event emission.

```typescript
class GitDataService extends EventEmitter {
  private cache: {
    status: GitStatus | null
    log: GitCommit[] | null
    branches: GitBranches | null
    graph: GraphData | null
  }
  private cwd: string

  async refresh(): Promise<void>          // Re-fetch all from gitAPI
  async getStatus(): Promise<GitStatus>   // Return cached or fetch
  async getLog(): Promise<GitCommit[]>
  async getBranches(): Promise<GitBranches>
  async getGraph(): Promise<GraphData>
  async getDiff(options?: DiffOptions): Promise<GitDiff[]>  // Never cached

  // Mutations — execute then auto-refresh
  async stage(paths: string[]): Promise<void>
  async unstage(paths: string[]): Promise<void>
  async commit(message: string): Promise<string>

  // Events emitted: 'status-changed', 'log-changed', 'branches-changed'
}
```

Cache is invalidated on `git-state-changed` IPC events from main process.

---

## 4. GitView — Top-Level Container

### 4.1 Lifecycle

```typescript
class GitView {
  readonly container: Container
  private visible: boolean = false

  constructor(app: Application, dataService: GitDataService)

  toggle(): void              // Show/hide, fetch data on show
  show(): void                // Activate view, hide terminals
  hide(): void                // Deactivate, restore terminals
  handleResize(width: number, height: number, headerHeight: number): void
  update(dt: number): void    // Called from app.ticker
  destroy(): void
}
```

### 4.2 Visibility Behavior

- When shown: terminal containers become `visible = false`, GitView container becomes `visible = true`
- When hidden: restore terminal containers, hide GitView
- TabBar remains visible (tabs still exist, just not rendering terminals)
- Other overlays (Dashboard, HistoryView) are mutually exclusive — showing GitView hides them

### 4.3 Layout Regions

GitView manages four child containers:

| Region | Position | Size |
|--------|----------|------|
| WorkingZone | Left | 20% width, full height |
| StagingZone | Center-left | 20% width, full height |
| HistoryZone | Right | 60% width, full height |
| BottomBar | Bottom | Full width, 32px (SafetyShield + mode indicators) |

Dividers between zones are draggable for resize (persist ratios in config).

---

## 5. Zones

### 5.1 WorkingZone — "Your Changes"

Displays files with unstaged changes (workingTree !== 'unmodified').

**Layout:** Vertical scrollable list of FileTile components.

**Header:** "Your Changes" (or "Working Directory" when git terminology is on). File count badge.

**Empty state:** "No changes" with muted text.

**Interactions:**
- Click tile → select, show diff in HistoryZone's diff panel
- Double-click tile → stage (`git add`)
- Drag tile rightward → stage
- Right-click → context menu: Stage, Discard Changes, Open in Terminal

### 5.2 StagingZone — "Ready to Commit"

Displays files staged in the index (index !== 'unmodified').

**Layout:** Same vertical list as WorkingZone.

**Header:** "Ready to Commit" / "Staging Area". File count badge.

**Footer:** Commit message input field + "Commit" button. Appears when zone has files.

**Interactions:**
- Click tile → select, show staged diff
- Double-click tile → unstage (`git restore --staged`)
- Drag tile leftward → unstage
- Enter in commit input → execute commit
- Right-click → context menu: Unstage, Show Diff

### 5.3 HistoryZone — "Saved History"

Two sub-panels stacked vertically:

**Top: BranchGraph** (60% of zone height)
- Railroad track visualization of commit history
- Horizontal scroll for time navigation
- Vertical lanes per branch
- Commits are clickable circles
- Current branch track glows
- HEAD indicator on current commit

**Bottom: Detail Panel** (40% of zone height)
- When a commit is selected: shows commit info + changed files list
- When a file is selected (from any zone): shows diff content
- Tabbed: "Changes" | "Commit Info"

---

## 6. Components

### 6.1 FileTile

A rectangular PixiJS Container representing one changed file.

```
┌────────────────────────────────┐
│ 🟢  src/renderer/src/main.ts  │   ← icon + filename
│     +42  -17                   │   ← change stats
└────────────────────────────────┘
```

**Visual properties:**
| Property | Encoding |
|----------|----------|
| Left border color | File state: green=added, red=deleted, yellow=modified, orange=conflicted, blue=renamed |
| Background opacity | Recency (brighter = more recent change) |
| Width | Fixed to zone width minus padding |
| Height | 36px standard, expandable to show path |

**Drag behavior:**
- `pointerdown` → begin drag, create ghost copy at 50% alpha
- `pointermove` → ghost follows cursor
- `pointerup` → if dropped in valid zone, execute stage/unstage
- Invalid drop → ghost snaps back with easing animation

### 6.2 CommitNode

A circle on the branch graph representing one commit.

**Visual properties:**
| Property | Encoding |
|----------|----------|
| Fill color | Author-based (hash author email to color) |
| Stroke | White if HEAD, branch color otherwise |
| Size | 8px radius standard, 12px if has refs |
| Label | Short hash + message (truncated), shown on hover or always for ref commits |

**Interactions:**
- Hover → tooltip: full hash, author, date, message
- Click → select, show commit details in Detail Panel
- Double-click → checkout (with confirmation dialog)

### 6.3 SafetyShield

Persistent 24px indicator in bottom-left corner.

| State | Color | Label |
|-------|-------|-------|
| All committed | Green | "All saved" |
| Uncommitted changes | Yellow | "Unsaved work" |
| Detached HEAD | Orange | "Detached — changes need a branch" |
| Mid-rebase/merge | Red | "In progress — finish or abort" |

Click → expands to show contextual actions (e.g., "Create branch" when detached, "Abort rebase" when rebasing).

### 6.4 PreviewOverlay (Phase 4)

Semi-transparent overlay that appears before destructive operations.

**Trigger:** User initiates merge, rebase, reset, or checkout with uncommitted changes.

**Content:** Shows which files will change, potential conflicts, and commits affected. Green = safe, orange = conflict, red = data loss risk.

**Actions:** "Proceed" / "Cancel" buttons.

---

## 7. BranchGraph Rendering

### 7.1 Lane Assignment Algorithm

1. Topological sort commits (newest first)
2. Assign main branch to lane 0
3. For each branch fork, assign next available lane
4. Merge commits connect lanes with bezier curves
5. Reclaim lanes after branch merges back

### 7.2 Drawing

```
Lane 0 (main)     Lane 1 (feature)
    ●─────────────────●  merge commit
    │                ╱
    ●               ●    feature commit 2
    │               │
    ●               ●    feature commit 1
    │              ╱
    ●─────────────●      branch point
    │
    ●
```

- Each lane is a vertical column, 40px apart
- Commits spaced 60px vertically
- Branch/merge curves: cubic bezier, 20px control point offset
- Track lines: 2px wide, branch-colored, 30% alpha between commits

### 7.3 Navigation

- Mouse wheel → horizontal scroll through history
- Cmd/Ctrl + wheel → zoom (compress/expand commit spacing)
- Click + drag → pan
- Home → jump to HEAD
- End → jump to oldest loaded commit

---

## 8. Friendly Labels

Toggle stored in config as `git.friendlyLabels: boolean` (default: `true`).

| Friendly | Git Term | Context |
|----------|----------|---------|
| Your Changes | Working Directory | Zone header |
| Ready to Commit | Staging Area / Index | Zone header |
| Saved History | Commits | Zone header |
| Side Quest | Branch | Branch graph labels |
| Bookmark | Tag | Branch graph labels |
| Panic Button | Stash | Stash shelf |
| Time Machine | Reflog | Reflog panel |
| All Saved | Clean | Safety shield |
| Unsaved Work | Dirty | Safety shield |

Menu toggle: View → Git View → "Show Git Terminology"

---

## 9. Configuration

Extend `AppConfig` with:

```typescript
interface GitViewConfig {
  enabled: boolean                  // Show git view option in menu
  friendlyLabels: boolean           // Default: true
  zoneRatios: [number, number, number]  // Default: [0.2, 0.2, 0.6]
  showFileMap: boolean              // Bottom panel visible
  graphMaxCommits: number           // Default: 100
  expertMode: boolean               // Show advanced controls
  autoRefresh: boolean              // Watch filesystem (default: true)
  refreshDebounceMs: number         // Default: 300
}
```

---

## 10. Menu Integration

Add to View menu:

```
View
├── Themes ▸
├── Show/Hide Productivity Bar    Ctrl+Shift+B
├── ─────────────────
├── Git View                      Ctrl+Shift+G
├── Git View Options ▸
│   ├── ☑ Friendly Labels
│   ├── ☑ Auto-Refresh
│   └── ☐ Expert Mode
```

---

## 11. Error Handling

| Scenario | Behavior |
|----------|----------|
| Not a git repo | GitView shows centered message: "Not a git repository. Run `git init` in your terminal." |
| Git not installed | Message: "Git not found. Install git to use Git View." |
| Corrupt .git | Message: "Git error: <stderr output>" with "Retry" button |
| Large repo (>1000 changed files) | Truncate file list, show "+N more files" with option to expand |
| Binary files | Show tile with "binary" label, no diff |
| Permission errors | Show file tile with lock icon, no diff available |

---

## 12. Performance Constraints

- **Status refresh:** < 100ms for repos with < 500 changed files
- **Log fetch:** < 200ms for 100 commits
- **Diff render:** < 50ms for files under 10,000 lines
- **Branch graph:** Render 200 commits at 60fps
- **FileTile pool:** Reuse PixiJS objects (same pattern as CellGrid dirty tracking)
- **Debounce:** File watcher events batched at 300ms
- **Lazy loading:** Only fetch diffs when a file is selected, not upfront

---

## 13. Phase Specifications

### Phase 1 — Foundation
- `gitManager.ts` with `status()`, `stage()`, `unstage()`, `commit()`
- `preload/index.ts` extended with `gitAPI`
- `GitDataService` with status caching
- `GitView` shell with toggle, resize, theme colors
- WorkingZone and StagingZone with FileTile list (no drag yet)
- Click to stage/unstage
- Commit message input + commit action
- SafetyShield (basic: green/yellow)
- `Ctrl+Shift+G` shortcut + View menu entry

### Phase 2 — Visual Identity
- `gitAPI.graph()` and `gitAPI.branches()`
- BranchGraph with lane assignment and rendering
- CommitNode with hover tooltips
- FileMap treemap (color + size coded)
- Commit detail panel
- Author-colored commit nodes

### Phase 3 — Diff Viewer
- `gitAPI.diff()` with hunk parsing
- Inline diff panel (line-based, color-coded +/-)
- Side-by-side diff mode toggle
- Line number gutters
- Syntax highlighting (reuse terminal color palette)

### Phase 4 — Safety Layer
- File watcher in main process → IPC push events
- Auto-refresh on state changes
- SafetyShield: all 4 states (green/yellow/orange/red)
- PreviewOverlay for destructive operations
- Detached HEAD warning with "Create Branch" action
- Mid-rebase/merge status with abort/continue actions

### Phase 5 — Expert Features
- Tree-sitter integration (`web-tree-sitter`)
- SymbolDiff: structural function/class-level diffs
- Blame heat map (right-click file → "Show History")
- Churn heat stripe per symbol
- Friendly labels toggle

### Phase 6 — Power Tools
- Interactive rebase: draggable commit cards (reorder, squash, drop, edit message)
- Reflog timeline below branch graph
- Bisect mode: binary search UI on commit graph
- Conflict resolution: ours/theirs side-by-side with accept buttons
- Stash shelf: stash cards with drag-to-apply
- FileTile drag-to-stage/unstage with ghost animation
