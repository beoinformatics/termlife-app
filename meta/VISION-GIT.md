# TermLife Git View — Vision

## Overview

A PixiJS-rendered Git View that makes git's invisible state model tangible and visual. Designed to serve both beginners (who find git confusing) and experts (who want power tools no existing GUI offers). Built on a game engine — no constraints from DOM or terminal grids.

---

## Core Design Principle: Make the Invisible Visible

Git confusion stems from hidden state. The Git View makes every concept a **physical, animated object** on screen.

---

## The Three Zones — Conveyor Belt Layout

Three distinct visual areas, left to right:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  YOUR CHANGES   │ ──>│ READY TO COMMIT │ ──>│  SAVED HISTORY  │
│ (working dir)   │    │ (staging/index)  │    │   (commits)     │
│                 │    │                  │    │                 │
│  [file tiles]   │    │  [file tiles]    │    │  [commit nodes] │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

- File thumbnails **physically sit** in one of these zones
- `git add` = thumbnail **animates** from Working to Staged
- `git commit` = staged files **sweep** into a new commit node
- `git restore --staged` = thumbnail slides back left
- **Drag-to-stage**: click/drag files between zones

**Beginner payoff**: "Oh, staging is just a holding area before I commit."
**Expert payoff**: At-a-glance state summary, fast stage/unstage interaction.

---

## File Map Panel

A **treemap or grid of thumbnails** — one rectangle per changed file:

| Color | Meaning |
|-------|---------|
| Grey | Unchanged |
| Green | Added |
| Red | Deleted |
| Yellow | Modified |
| Orange | Conflicted |

- **Size** encodes change magnitude (more lines changed → bigger tile)
- **Brightness** encodes recency (just-changed files glow, older changes fade)
- Hover → tooltip: filename, lines +/-, last author
- Click → zoom into Symbol Diff Panel

---

## Symbol Diff Panel — Structural, Not Line-Based

Parse files with **tree-sitter** for language-aware structural diffs:

- Show **functions/classes/methods** in the file, not raw lines
- Each symbol gets a status: added, modified, deleted, renamed, moved
- Modified functions show a **mini inline diff** — just the changed lines
- Classes expand to show which methods changed
- **Heat stripe**: thin colored bar showing how frequently the function has changed across recent commits (churn = deserves attention)
- **Language auto-detection** via file extension, with manual override chooser

---

## Branch Graph — Railroad Tracks

Branches visualized as **parallel railroad tracks**, not abstract trees:

- Main track runs horizontally
- Branches fork at an angle, run parallel, curve back at merge
- **Current branch glows** — you're the train on that track
- Creating a branch = track visibly splits (nothing scary happened)
- Switching branches = train smoothly moves to another track, file map **morphs** to show differences
- Commits are circles, color-coded by author
- Hover a commit → changed files light up in the file map
- Drag to navigate history — file map updates in real-time
- Pinch/scroll to zoom between "last 10 commits" and "full history"

---

## Friendly Labels with Real Names

Show both — the friendly name teaches, the real name builds git literacy:

| Friendly Label | Git Term |
|---------------|----------|
| Your Changes | working directory |
| Ready to Commit | staging area / index |
| Saved History | commits |
| Side Quest | branch |
| Bookmark | tag |
| Panic Button | stash |
| Time Machine | reflog |

Toggle: **"Show git terminology"** — flips all labels. Beginners start friendly, gradually switch. Experts turn it on immediately.

---

## "What Will Happen" Preview

Before destructive operations, show a **dry-run preview overlay**:

- **Before merge**: which files change, are there conflicts? Green = clean, orange = conflicts with specific symbols listed
- **Before reset**: highlight which commits "disappear" (with note: "still in reflog for 30 days")
- **Before rebase**: animate commits lifting off one branch and replaying onto another, showing where conflicts would occur

Preview appears in-view when the user types a known-scary command, *before* they hit enter.

---

## Safety Net Indicator

Persistent small element — a **safety shield**:

| State | Shield | Plain English |
|-------|--------|---------------|
| Everything committed | Green | "All saved" |
| Uncommitted changes | Yellow | "You have unsaved work" |
| Detached HEAD | Orange | "You're looking at old code. Changes need a branch to keep." |
| Mid-rebase/merge | Red | "You're in the middle of something — here's how to finish or abort" |

---

## Expert Power Features (Progressive Disclosure)

These appear on hover, keyboard shortcuts, or "advanced" toggle:

### Blame Heat Map
Right-click file → "Show history." Symbol panel shows author-colored bands — who wrote what, when. High-churn functions (many authors, many changes) are visually obvious.

### Interactive Rebase
Select commit range in branch graph → "Rebase" mode. Commits become draggable cards:
- **Reorder**: drag up/down
- **Squash**: drag one onto another, they merge with a visual snap
- **Drop**: drag off the track, fades with undo option
- **Edit message**: double-click the label

### Reflog as Time Machine
Collapsible timeline below the branch graph showing *every* state the repo has been in. "Accidentally reset? Scroll back to 10 minutes ago, click restore."

### Bisect Mode
Click "Find Bug" → commit graph enters binary search mode. Mark commits green/red, view narrows visually until it pinpoints the offending commit.

### Conflict Resolution
Conflicting files pulse orange. Click → symbol panel shows ours/theirs side by side with "accept left / accept right / accept both" buttons per hunk.

### Stash Shelf
Small area showing stashes as stacked cards. Drag onto file map to apply. Preview on hover.

---

## Progressive Disclosure — Same View, Scales Up

| Level | What They See |
|-------|--------------|
| **Beginner** | Three zones, friendly labels, drag-to-stage, big commit button, safety shield |
| **Intermediate** | Branch tracks, preview system, blame, git terminology toggle |
| **Expert** | Interactive rebase, reflog, bisect, keyboard shortcuts for everything |

The visual metaphor (zones, tracks, thumbnails) **never changes** — just more controls revealed.

---

## Implementation Notes

- **Tree-sitter** (`node-tree-sitter`) for language-aware AST parsing — supports 100+ languages, runs offline, fast enough for real-time
- **Git data** via shelling out to `git` with structured output formats (`--stat`, `--format`, `--name-status`)
- **PixiJS rendering**: Containers per panel, sprites for thumbnails, Graphics for branch curves, Text for labels
- Reuse existing CellGrid dirty-tracking pattern for efficient updates
- File system watcher triggers re-render on changes

---

## Why This Matters

No existing git GUI has a game engine behind it. This view can offer:
- Smooth continuous zoom from repo overview → file → function → line diff
- Physics-based branch graph layout
- Particle effects on commit
- Real-time animated state transitions
- File thumbnails as actual minimap renders

The goal: git stops being scary CLI incantations and becomes a **spatial, visual experience** that teaches its own mental model through interaction.
