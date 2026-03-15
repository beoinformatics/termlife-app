# TermLife Git View — Implementation Plan (TDD)

Every step follows Red-Green-Refactor: write failing tests first, implement minimal code to pass, then refactor.

---

## Phase 1 — Foundation

### 1.1 Type Definitions

- [ ] Create `src/main/git/types.ts` with all shared interfaces (`GitStatus`, `GitFileStatus`, `FileState`, `GitCommit`, `GitDiff`, `DiffHunk`, `DiffLine`, `GitBranches`, `BranchInfo`, `StashEntry`, `GraphData`, `GraphCommit`, `GraphBranch`)
- [ ] Write tests verifying type guards / validation helpers for each interface
- [ ] Implement type guard functions, verify tests pass
- [ ] Refactor: ensure types are re-exported cleanly for both main and renderer

### 1.2 Git CLI Parser — `src/main/git/gitParser.ts`

Pure functions that parse raw git CLI output into typed structures. Fully testable without git.

- [ ] **Tests RED:** Write `src/main/git/__tests__/gitParser.test.ts`
  - [ ] Test `parseStatus()` — parse `git status --porcelain=v2 --branch` output
    - [ ] Modified file in working tree
    - [ ] Staged file in index
    - [ ] Untracked file
    - [ ] Renamed file (with original path)
    - [ ] Conflicted file (both modified)
    - [ ] Branch header parsing (name, upstream, ahead/behind)
    - [ ] Detached HEAD
    - [ ] Empty repo (no commits)
    - [ ] Mixed states (file modified in both index and working tree)
  - [ ] Test `parseLog()` — parse `git log --format=<custom>` output
    - [ ] Single commit
    - [ ] Multiple commits with parents
    - [ ] Merge commit (2 parents)
    - [ ] Commit with refs (branch, tag)
    - [ ] Commit with multi-line body
    - [ ] Empty log (no commits)
  - [ ] Test `parseDiff()` — parse `git diff` unified format output
    - [ ] Single file, single hunk
    - [ ] Single file, multiple hunks
    - [ ] Multiple files
    - [ ] Renamed file diff
    - [ ] Binary file (no hunks)
    - [ ] New file (all additions)
    - [ ] Deleted file (all deletions)
    - [ ] Stats counting (+/- lines)
  - [ ] Test `parseBranches()` — parse `git branch` output
    - [ ] Local branches with current marker
    - [ ] Upstream tracking info
    - [ ] Ahead/behind counts
    - [ ] No branches (fresh repo)
  - [ ] Test `parseStashList()` — parse `git stash list` output
    - [ ] Multiple stash entries
    - [ ] Empty stash
- [ ] **GREEN:** Implement each parser function, one at a time, making tests pass
- [ ] **REFACTOR:** Extract shared helpers (line splitting, field extraction)
- [ ] Run `npm run test:coverage` — verify 80%+ coverage on `gitParser.ts`

### 1.3 Git Command Builder — `src/main/git/gitCommands.ts`

Functions that build the correct `git` CLI arguments for each operation.

- [ ] **Tests RED:** Write `src/main/git/__tests__/gitCommands.test.ts`
  - [ ] Test `statusArgs(cwd)` returns correct args array
  - [ ] Test `logArgs(cwd, options)` with maxCount, branch, all flags
  - [ ] Test `diffArgs(cwd, options)` with staged, file, commit options
  - [ ] Test `branchArgs(cwd)` returns correct args
  - [ ] Test `stageArgs(cwd, paths)` — handles single/multiple paths, special chars
  - [ ] Test `unstageArgs(cwd, paths)`
  - [ ] Test `commitArgs(cwd, message)` — handles multi-line messages
  - [ ] Test `restoreArgs(cwd, paths)`
- [ ] **GREEN:** Implement command builder functions
- [ ] **REFACTOR:** Consolidate common patterns
- [ ] Run tests, verify all pass

### 1.4 Git Manager — `src/main/git/gitManager.ts`

Orchestrates command execution: builds args, spawns `git`, feeds output to parsers.

- [ ] **Tests RED:** Write `src/main/git/__tests__/gitManager.test.ts`
  - [ ] Mock `child_process.execFile` (never shell out in tests)
  - [ ] Test `status(cwd)` — calls correct git command, returns parsed `GitStatus`
  - [ ] Test `log(cwd, options)` — returns parsed `GitCommit[]`
  - [ ] Test `diff(cwd, options)` — returns parsed `GitDiff[]`
  - [ ] Test `branches(cwd)` — returns parsed `GitBranches`
  - [ ] Test `stashList(cwd)` — returns parsed `StashEntry[]`
  - [ ] Test `stage(cwd, paths)` — calls `git add` with correct args
  - [ ] Test `unstage(cwd, paths)` — calls `git restore --staged`
  - [ ] Test `commit(cwd, message)` — calls `git commit`, returns hash
  - [ ] Test error handling: git not found
  - [ ] Test error handling: not a git repo
  - [ ] Test error handling: command fails with stderr
- [ ] **GREEN:** Implement `gitManager.ts`
- [ ] **REFACTOR:** Extract `execGit()` helper with timeout and error wrapping
- [ ] Run tests, verify all pass + coverage

### 1.5 IPC Registration — Main Process

- [ ] **Tests RED:** Write `src/main/__tests__/gitIpc.test.ts`
  - [ ] Mock `ipcMain.handle` and `gitManager`
  - [ ] Test each IPC channel is registered (`git-status`, `git-log`, etc.)
  - [ ] Test IPC handler calls gitManager with correct args
  - [ ] Test error propagation through IPC
- [ ] **GREEN:** Add IPC handlers in `src/main/git/gitIpc.ts`
  - [ ] `ipcMain.handle('git-status', (_, cwd) => gitManager.status(cwd))`
  - [ ] `ipcMain.handle('git-log', (_, cwd, opts) => gitManager.log(cwd, opts))`
  - [ ] `ipcMain.handle('git-diff', (_, cwd, opts) => gitManager.diff(cwd, opts))`
  - [ ] `ipcMain.handle('git-branches', (_, cwd) => gitManager.branches(cwd))`
  - [ ] `ipcMain.handle('git-stash-list', (_, cwd) => gitManager.stashList(cwd))`
  - [ ] `ipcMain.handle('git-stage', (_, cwd, paths) => gitManager.stage(cwd, paths))`
  - [ ] `ipcMain.handle('git-unstage', (_, cwd, paths) => gitManager.unstage(cwd, paths))`
  - [ ] `ipcMain.handle('git-commit', (_, cwd, msg) => gitManager.commit(cwd, msg))`
  - [ ] `ipcMain.handle('git-restore', (_, cwd, paths) => gitManager.restore(cwd, paths))`
- [ ] **REFACTOR:** Wire into `src/main/index.ts` startup
- [ ] Run tests, verify all pass

### 1.6 Preload Bridge — `window.gitAPI`

- [ ] Extend `src/preload/index.ts` with `gitAPI` on contextBridge
  - [ ] `status(cwd)`, `log(cwd, opts)`, `diff(cwd, opts)`, `branches(cwd)`
  - [ ] `stashList(cwd)`, `stage(cwd, paths)`, `unstage(cwd, paths)`
  - [ ] `commit(cwd, msg)`, `restore(cwd, paths)`
  - [ ] `onStateChanged(cwd, cb)`, `offStateChanged(cwd)`
- [ ] Add TypeScript declaration for `window.gitAPI` in renderer types
- [ ] Manual smoke test: open dev console, call `window.gitAPI.status('.')` in a git repo

### 1.7 GitDataService — `src/renderer/src/git/GitDataService.ts`

Client-side cache and event emitter wrapping `window.gitAPI`.

- [ ] **Tests RED:** Write `src/renderer/src/git/__tests__/GitDataService.test.ts`
  - [ ] Mock `window.gitAPI`
  - [ ] Test `getStatus()` — calls gitAPI.status, caches result
  - [ ] Test `getStatus()` second call — returns cached, no API call
  - [ ] Test `refresh()` — invalidates cache, re-fetches
  - [ ] Test `stage(paths)` — calls gitAPI.stage, then auto-refreshes status
  - [ ] Test `unstage(paths)` — calls gitAPI.unstage, then auto-refreshes
  - [ ] Test `commit(message)` — calls gitAPI.commit, auto-refreshes
  - [ ] Test event emission: `'status-changed'` fires after refresh
  - [ ] Test `setCwd()` — clears cache when directory changes
- [ ] **GREEN:** Implement GitDataService
- [ ] **REFACTOR:** Ensure clean EventEmitter teardown in `destroy()`
- [ ] Run tests, verify all pass + coverage

### 1.8 GitView Shell — `src/renderer/src/git/GitView.ts`

Top-level Container with toggle/resize/update lifecycle.

- [ ] **Tests RED:** Write `src/renderer/src/git/__tests__/GitView.test.ts`
  - [ ] Mock PixiJS Container, Application
  - [ ] Test `toggle()` — flips visibility
  - [ ] Test `show()` — sets `container.visible = true`, triggers data fetch
  - [ ] Test `hide()` — sets `container.visible = false`
  - [ ] Test `handleResize()` — updates container dimensions
  - [ ] Test `isVisible` property
  - [ ] Test `destroy()` — cleans up children and listeners
- [ ] **GREEN:** Implement GitView shell
- [ ] **REFACTOR:** Ensure consistent pattern with Dashboard

### 1.9 WorkingZone — `src/renderer/src/git/zones/WorkingZone.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/zones/__tests__/WorkingZone.test.ts`
  - [ ] Test renders file tiles from GitStatus (working tree changes only)
  - [ ] Test filters out files with `workingTree === 'unmodified'`
  - [ ] Test file count in header
  - [ ] Test empty state message when no changes
  - [ ] Test click on tile emits selection event
  - [ ] Test double-click on tile triggers stage action
- [ ] **GREEN:** Implement WorkingZone
- [ ] **REFACTOR:** Extract shared zone logic if patterns emerge

### 1.10 StagingZone — `src/renderer/src/git/zones/StagingZone.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/zones/__tests__/StagingZone.test.ts`
  - [ ] Test renders file tiles from GitStatus (index changes only)
  - [ ] Test filters out files with `index === 'unmodified'`
  - [ ] Test file count in header
  - [ ] Test empty state message
  - [ ] Test click on tile emits selection event
  - [ ] Test double-click on tile triggers unstage action
  - [ ] Test commit input appears when zone has files
  - [ ] Test commit input hidden when zone is empty
  - [ ] Test commit action calls GitDataService.commit()
- [ ] **GREEN:** Implement StagingZone
- [ ] **REFACTOR:** Share base zone class with WorkingZone

### 1.11 FileTile — `src/renderer/src/git/components/FileTile.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/components/__tests__/FileTile.test.ts`
  - [ ] Test color mapping: added=green, deleted=red, modified=yellow, conflicted=orange, renamed=blue
  - [ ] Test displays filename (basename, not full path)
  - [ ] Test displays change stats (+N / -N) when provided
  - [ ] Test truncates long filenames with ellipsis
  - [ ] Test click event fires with file path
  - [ ] Test double-click event fires with file path
- [ ] **GREEN:** Implement FileTile
- [ ] **REFACTOR:** Ensure theme colors are used

### 1.12 SafetyShield (Basic) — `src/renderer/src/git/components/SafetyShield.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/components/__tests__/SafetyShield.test.ts`
  - [ ] Test green state when status has no changed files
  - [ ] Test yellow state when status has uncommitted changes
  - [ ] Test label text matches state
  - [ ] Test updates when status changes
- [ ] **GREEN:** Implement SafetyShield (green + yellow only for Phase 1)
- [ ] **REFACTOR:** Prepare for orange/red states in Phase 4

### 1.13 Integration Wiring — `src/renderer/src/main.ts`

- [ ] Register `git:toggle` command in CommandRegistry
- [ ] Add `Ctrl+Shift+G` keyboard shortcut handler
- [ ] Add GitView to `app.stage`
- [ ] Wire GitView into ticker loop (`gitView.update()`)
- [ ] Wire GitView into resize handler
- [ ] Ensure mutual exclusivity with Dashboard/HistoryView
- [ ] Add "Git View" to View menu in `src/main/index.ts`
- [ ] Manual integration test: toggle Git View on/off in a git repo
- [ ] Manual integration test: see files in Working/Staging zones
- [ ] Manual integration test: click to stage/unstage
- [ ] Manual integration test: commit from staging zone

### 1.14 Phase 1 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: full workflow (modify file → stage → commit) in Git View

---

## Phase 2 — Visual Identity

### 2.1 Graph Data API

- [ ] **Tests RED:** Add graph parsing tests to `gitParser.test.ts`
  - [ ] Test `parseGraph()` — commits with parent refs
  - [ ] Test merge commits (multiple parents)
  - [ ] Test ref decoration parsing
- [ ] **GREEN:** Implement `parseGraph()` in gitParser
- [ ] Add `graph()` method to gitManager
- [ ] **Tests RED:** Test gitManager.graph() in `gitManager.test.ts`
- [ ] **GREEN:** Implement gitManager.graph()
- [ ] Wire IPC handler `git-graph`
- [ ] Extend preload bridge with `gitAPI.graph()`
- [ ] Extend GitDataService with `getGraph()` + caching
- [ ] **Tests:** Add GitDataService.getGraph() tests
- [ ] Run tests, verify all pass

### 2.2 Lane Assignment Algorithm — `src/renderer/src/git/panels/laneAssigner.ts`

Pure algorithm, fully testable.

- [ ] **Tests RED:** Write `src/renderer/src/git/panels/__tests__/laneAssigner.test.ts`
  - [ ] Test linear history — all commits in lane 0
  - [ ] Test single branch — fork assigns lane 1, merge reclaims
  - [ ] Test multiple branches — each gets unique lane
  - [ ] Test lane reuse after merge
  - [ ] Test octopus merge (3+ parents)
  - [ ] Test detached commits
  - [ ] Test empty input
- [ ] **GREEN:** Implement lane assignment algorithm
- [ ] **REFACTOR:** Optimize for large histories (100+ commits)
- [ ] Run tests, verify all pass + coverage

### 2.3 BranchGraph — `src/renderer/src/git/panels/BranchGraph.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/panels/__tests__/BranchGraph.test.ts`
  - [ ] Test creates correct number of commit nodes
  - [ ] Test lane positioning (x offset per lane)
  - [ ] Test commit spacing (y offset per commit)
  - [ ] Test branch track colors assigned per branch
  - [ ] Test current branch track has glow effect
  - [ ] Test HEAD indicator on current commit
  - [ ] Test scroll bounds (min/max)
- [ ] **GREEN:** Implement BranchGraph rendering
- [ ] **REFACTOR:** Extract drawing helpers

### 2.4 CommitNode — `src/renderer/src/git/components/CommitNode.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/components/__tests__/CommitNode.test.ts`
  - [ ] Test author email → color hashing is deterministic
  - [ ] Test same email always produces same color
  - [ ] Test node size: 8px standard, 12px with refs
  - [ ] Test label shows short hash + truncated message
  - [ ] Test click event fires with commit hash
- [ ] **GREEN:** Implement CommitNode
- [ ] **REFACTOR:** Ensure theme integration

### 2.5 FileMap Treemap — `src/renderer/src/git/panels/FileMap.ts`

- [ ] **Tests RED:** Write treemap layout algorithm tests
  - [ ] Test `computeTreemap(files, width, height)` — returns positioned rectangles
  - [ ] Test larger change count → larger rectangle
  - [ ] Test color assignment by file state
  - [ ] Test single file fills entire area
  - [ ] Test handles empty file list
- [ ] **GREEN:** Implement treemap layout + rendering
- [ ] **REFACTOR:** Optimize for many files

### 2.6 HistoryZone — `src/renderer/src/git/zones/HistoryZone.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/zones/__tests__/HistoryZone.test.ts`
  - [ ] Test contains BranchGraph sub-panel
  - [ ] Test contains detail panel
  - [ ] Test commit selection updates detail panel
  - [ ] Test resize distributes space between sub-panels
- [ ] **GREEN:** Implement HistoryZone
- [ ] **REFACTOR:** Wire to GitDataService events

### 2.7 Phase 2 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: branch graph renders correctly for current repo
- [ ] Manual QA: commit nodes are clickable, show details
- [ ] Manual QA: FileMap shows changed files with correct colors/sizes

---

## Phase 3 — Diff Viewer

### 3.1 Diff Parsing (extend gitParser)

- [ ] **Tests RED:** Add comprehensive diff parsing tests
  - [ ] Test unified diff with context lines
  - [ ] Test hunk header parsing (`@@ -a,b +c,d @@`)
  - [ ] Test line number assignment for context/addition/deletion
  - [ ] Test no-newline-at-end-of-file marker
  - [ ] Test binary file detection
  - [ ] Test permission-only changes
- [ ] **GREEN:** Implement/extend `parseDiff()` with line number tracking
- [ ] Run tests, verify all pass

### 3.2 Diff Renderer — `src/renderer/src/git/panels/DiffPanel.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/panels/__tests__/DiffPanel.test.ts`
  - [ ] Test renders correct number of lines from DiffHunk
  - [ ] Test addition lines use green color
  - [ ] Test deletion lines use red color
  - [ ] Test context lines use default color
  - [ ] Test line number gutter alignment
  - [ ] Test scrollable for large diffs
  - [ ] Test handles empty diff (no changes)
- [ ] **GREEN:** Implement inline diff renderer
- [ ] **REFACTOR:** Optimize text rendering (pool Text objects like CellGrid)

### 3.3 Side-by-Side Mode

- [ ] **Tests RED:** Write side-by-side layout tests
  - [ ] Test old lines on left, new lines on right
  - [ ] Test aligned line numbers across panels
  - [ ] Test insertion shows blank on left side
  - [ ] Test deletion shows blank on right side
- [ ] **GREEN:** Implement side-by-side rendering mode
- [ ] Add toggle button (inline ↔ side-by-side)

### 3.4 Wire Diff into GitView

- [ ] Click file in WorkingZone → shows unstaged diff in detail panel
- [ ] Click file in StagingZone → shows staged diff
- [ ] Click commit in BranchGraph → shows commit diff
- [ ] **Test:** Verify correct diff options are passed for each context
- [ ] Manual QA: view diffs for modified, added, deleted, renamed files

### 3.5 Phase 3 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: inline diff renders correctly with colors and line numbers
- [ ] Manual QA: side-by-side mode works
- [ ] Manual QA: switching between files updates diff panel

---

## Phase 4 — Safety Layer

### 4.1 File Watcher — `src/main/git/gitWatcher.ts`

- [ ] **Tests RED:** Write `src/main/git/__tests__/gitWatcher.test.ts`
  - [ ] Mock `fs.watch`
  - [ ] Test watches `.git/HEAD`, `.git/index`, `.git/refs/`
  - [ ] Test debounces rapid changes (300ms)
  - [ ] Test emits single event for batched changes
  - [ ] Test cleanup on destroy (stops watchers)
  - [ ] Test handles missing `.git` directory gracefully
  - [ ] Test handles watcher errors without crashing
- [ ] **GREEN:** Implement gitWatcher
- [ ] Wire watcher → IPC push (`git-state-changed`) to renderer
- [ ] Wire GitDataService to listen for `git-state-changed` and auto-refresh
- [ ] **Test:** GitDataService auto-refresh on IPC event
- [ ] Run tests, verify all pass

### 4.2 SafetyShield — Full States

- [ ] **Tests RED:** Extend `SafetyShield.test.ts`
  - [ ] Test orange state: detached HEAD
  - [ ] Test red state: mid-merge (merging=true)
  - [ ] Test red state: mid-rebase (rebasing=true)
  - [ ] Test label text for each state
  - [ ] Test click expands action panel
  - [ ] Test "Create Branch" action in detached state
  - [ ] Test "Abort Rebase" action in rebase state
  - [ ] Test "Abort Merge" action in merge state
- [ ] **GREEN:** Implement all 4 SafetyShield states
- [ ] Wire action buttons to gitAPI calls
- [ ] Run tests, verify all pass

### 4.3 PreviewOverlay — `src/renderer/src/git/components/PreviewOverlay.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/components/__tests__/PreviewOverlay.test.ts`
  - [ ] Test shows file change list for merge preview
  - [ ] Test highlights conflicting files in orange
  - [ ] Test "Proceed" button triggers action
  - [ ] Test "Cancel" button dismisses overlay
  - [ ] Test overlay blocks interaction with underlying view
- [ ] **GREEN:** Implement PreviewOverlay
- [ ] Wire to checkout/merge/rebase actions
- [ ] **REFACTOR:** Ensure overlay is reusable for different operations

### 4.4 Phase 4 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: Git View auto-updates when files change on disk
- [ ] Manual QA: SafetyShield shows correct state (create detached HEAD, start merge)
- [ ] Manual QA: PreviewOverlay appears before destructive operations

---

## Phase 5 — Expert Features

### 5.1 Tree-sitter Integration

- [ ] Add `web-tree-sitter` dependency
- [ ] **Tests RED:** Write language parser loading tests
  - [ ] Test loads JavaScript/TypeScript grammar
  - [ ] Test parses source into AST
  - [ ] Test extracts function/class/method symbols
- [ ] **GREEN:** Implement tree-sitter parser service
- [ ] Run tests, verify all pass

### 5.2 SymbolDiff — `src/renderer/src/git/panels/SymbolDiff.ts`

- [ ] **Tests RED:** Write `src/renderer/src/git/panels/__tests__/SymbolDiff.test.ts`
  - [ ] Test extracts symbols from old and new file versions
  - [ ] Test detects added function
  - [ ] Test detects deleted function
  - [ ] Test detects modified function (changed body)
  - [ ] Test detects renamed function
  - [ ] Test class with changed methods
  - [ ] Test shows inline diff for modified symbols only
- [ ] **GREEN:** Implement SymbolDiff panel
- [ ] **REFACTOR:** Support multiple languages via grammar loading

### 5.3 Blame Heat Map

- [ ] **Tests RED:** Write blame parser tests
  - [ ] Test `parseBlame()` — parse `git blame --porcelain` output
  - [ ] Test author extraction per line range
  - [ ] Test churn calculation (count of unique commits per function)
- [ ] **GREEN:** Implement blame parsing and heat map rendering
- [ ] Wire to right-click → "Show History" on file tiles
- [ ] Run tests, verify all pass

### 5.4 Friendly Labels Toggle

- [ ] **Tests RED:** Write label mapping tests
  - [ ] Test friendly → git term mapping
  - [ ] Test toggle switches all labels
  - [ ] Test config persistence
- [ ] **GREEN:** Implement label toggle in GitView
- [ ] Add menu item: View → Git View Options → "Show Git Terminology"
- [ ] Run tests, verify all pass

### 5.5 Phase 5 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: SymbolDiff shows function-level changes
- [ ] Manual QA: Blame heat map colors by author
- [ ] Manual QA: Friendly labels toggle works in menu

---

## Phase 6 — Power Tools

### 6.1 Interactive Rebase UI

- [ ] **Tests RED:** Write rebase plan builder tests
  - [ ] Test commit range selection → rebase plan
  - [ ] Test reorder operation
  - [ ] Test squash operation (merge two commits)
  - [ ] Test drop operation
  - [ ] Test edit message operation
  - [ ] Test plan → `git rebase --exec` command generation
- [ ] **GREEN:** Implement rebase plan builder
- [ ] Implement draggable commit cards UI
- [ ] Wire to `git rebase -i` via stdin scripting
- [ ] Manual QA: reorder commits, squash, drop

### 6.2 Reflog Timeline

- [ ] **Tests RED:** Write reflog parser tests
  - [ ] Test `parseReflog()` — parse `git reflog --format=<custom>` output
  - [ ] Test each reflog entry has hash, action, message, timestamp
- [ ] **GREEN:** Implement reflog parsing + timeline rendering
- [ ] Wire "Restore" action to `git checkout <hash>`
- [ ] Run tests, verify all pass

### 6.3 Bisect Mode

- [ ] **Tests RED:** Write bisect state machine tests
  - [ ] Test initial state: all commits neutral
  - [ ] Test mark good → updates state
  - [ ] Test mark bad → updates state
  - [ ] Test binary search narrows range correctly
  - [ ] Test identifies target commit when range = 1
  - [ ] Test reset clears all marks
- [ ] **GREEN:** Implement bisect state machine + UI overlay on branch graph
- [ ] Wire to `git bisect start/good/bad/reset`
- [ ] Run tests, verify all pass

### 6.4 Conflict Resolution UI

- [ ] **Tests RED:** Write conflict parser tests
  - [ ] Test detects `<<<<<<<`, `=======`, `>>>>>>>` markers
  - [ ] Test extracts ours/theirs/base sections
  - [ ] Test multiple conflicts in one file
- [ ] **GREEN:** Implement conflict parser + side-by-side resolution panel
- [ ] Wire "Accept Left/Right/Both" buttons to file write + stage
- [ ] Run tests, verify all pass

### 6.5 Stash Shelf

- [ ] **Tests RED:** Write stash shelf rendering tests
  - [ ] Test renders stash entries as cards
  - [ ] Test hover shows stash preview (changed files)
  - [ ] Test apply action calls `gitAPI.stashPop()`
  - [ ] Test drop action calls stash drop
- [ ] **GREEN:** Implement stash shelf UI
- [ ] Run tests, verify all pass

### 6.6 Drag-to-Stage/Unstage

- [ ] **Tests RED:** Write drag interaction tests
  - [ ] Test drag start creates ghost at 50% alpha
  - [ ] Test drag move updates ghost position
  - [ ] Test drop in valid zone triggers stage/unstage
  - [ ] Test drop in invalid zone snaps back
  - [ ] Test drag cancelled on Escape key
- [ ] **GREEN:** Implement drag behavior on FileTile
- [ ] **REFACTOR:** Smooth easing animations on drop/snap-back
- [ ] Run tests, verify all pass

### 6.7 Phase 6 Verification

- [ ] Run `npm run test` — all tests pass
- [ ] Run `npm run test:coverage` — 80%+ on all new files
- [ ] Run `npm run typecheck` — no type errors
- [ ] Run `npm run build` — production build succeeds
- [ ] Manual QA: interactive rebase workflow
- [ ] Manual QA: reflog browse and restore
- [ ] Manual QA: bisect find-the-bug workflow
- [ ] Manual QA: conflict resolution accept left/right/both
- [ ] Manual QA: stash shelf apply and drop
- [ ] Manual QA: drag files between zones

---

## Final Verification

- [ ] Run full test suite: `npm run test`
- [ ] Run full coverage: `npm run test:coverage` — 80%+ overall on git/ directory
- [ ] Run typecheck: `npm run typecheck` — zero errors
- [ ] Run production build: `npm run build` — succeeds
- [ ] Performance test: Git View opens in < 500ms on a repo with 100+ commits
- [ ] Performance test: branch graph renders 200 commits at 60fps
- [ ] Performance test: status refresh < 100ms with < 500 changed files
- [ ] Accessibility: keyboard navigation works through all zones
- [ ] Theme test: Git View renders correctly in 3+ different themes
- [ ] Error test: Git View gracefully handles non-git directories
