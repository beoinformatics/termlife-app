# TermLife Command Language (TCL) — Complete Reference

## Overview

Every action in TermLife has a canonical text representation using the **TermLife Command Language (TCL)**. Commands are enclosed in square brackets:

```
[category:action arguments]
```

Commands can be entered via:
1. **Keyboard shortcut** — direct key combination
2. **Command palette** — `Cmd/Ctrl+Shift+P`, then type to search
3. **Mouse/UI** — click a button or UI element
4. **Replay file** — automated playback from a saved session

---

## Command Reference

### Tab Management

| TCL Command | Description | Keyboard Shortcut | UI Equivalent |
|-------------|-------------|-------------------|---------------|
| `[tab:new]` | Create a new tab (single pane layout) | `Cmd/Ctrl+T` | Click the single-pane layout button (first icon in title bar) |
| `[tab:new vertical]` | Create tab with vertical split | — | Click the vertical split button (second icon in title bar) |
| `[tab:new horizontal]` | Create tab with horizontal split | — | Click the horizontal split button (third icon in title bar) |
| `[tab:new quad]` | Create tab with quad layout | — | Click the quad split button (fourth icon in title bar) |
| `[tab:close]` | Close the active tab | `Cmd/Ctrl+W` | Click the `x` button on a tab |
| `[tab:switch N]` | Switch to tab N (1-indexed) | `Cmd/Ctrl+1` through `Cmd/Ctrl+9` | Click a tab in the tab bar |
| `[tab:prev]` | Switch to previous tab (cycles) | `Shift+Cmd/Ctrl+[` | — |
| `[tab:next]` | Switch to next tab (cycles) | `Shift+Cmd/Ctrl+]` | — |
| `[tab:smart-switch]` | Smart tab switch based on tab state | `Ctrl+Tab` | — |

**Smart Tab Switch logic:**
- If current tab is idle/running/error: switches to the lowest-index tab awaiting input (`running-input`), then next idle, then next running.
- If current tab is awaiting input: switches to the next tab also awaiting input. If none, does nothing.

---

### Split Pane Layouts

Split layout is set at tab creation time. The layout buttons in the title bar create a **new tab** with the specified layout.

| TCL Command | Description | UI Equivalent |
|-------------|-------------|---------------|
| `[tab:new]` | Single pane (default) | First layout button in title bar (single rectangle icon) |
| `[tab:new vertical]` | Two panes side-by-side | Second layout button (two vertical rectangles) |
| `[tab:new horizontal]` | Two panes stacked | Third layout button (two horizontal rectangles) |
| `[tab:new quad]` | Four panes in 2x2 grid | Fourth layout button (2x2 grid icon) |

---

### Visual Effects

| TCL Command | Description | Keyboard Shortcut | UI Equivalent |
|-------------|-------------|-------------------|---------------|
| `[crt:toggle]` | Toggle CRT scanline filter | `Ctrl+Shift+C` | — |
| `[matrix:toggle]` | Toggle Matrix rain animation | `Ctrl+Shift+M` | — |

---

### Views

| TCL Command | Description | Keyboard Shortcut | UI Equivalent |
|-------------|-------------|-------------------|---------------|
| `[dashboard:toggle]` | Toggle the tab dashboard overview | `Cmd/Ctrl+Shift+D` | Click the dashboard button (2x2 grid icon, far right in title bar) |
| `[filebrowser:toggle]` | Toggle file browser in focused pane | `Cmd/Ctrl+Shift+E` | Click the folder icon button in title bar |
| `[history:toggle]` | Toggle command history view | `Cmd/Ctrl+Shift+H` | — |
| `[history:open]` | Open command history view | — | — |
| `[history:close]` | Close command history view | `Escape` (when history is open) | — |
| `[palette:toggle]` | Toggle command palette | `Cmd/Ctrl+Shift+P` | — |

---

### Scrollback Navigation

| TCL Command | Description | Keyboard Shortcut | UI Equivalent |
|-------------|-------------|-------------------|---------------|
| `[scroll:up]` | Scroll up 5 lines | `Shift+PageUp` | Mouse wheel up |
| `[scroll:down]` | Scroll down 5 lines | `Shift+PageDown` | Mouse wheel down |
| `[scroll:top]` | Jump to top of scrollback | `Cmd/Ctrl+Home` | — |
| `[scroll:bottom]` | Jump to bottom (latest output) | `Cmd/Ctrl+End` | — |

---

### Theme Commands (planned)

These commands are defined in the architecture but not yet registered in the command registry:

| TCL Command | Description | UI Equivalent |
|-------------|-------------|---------------|
| `[theme:set NAME]` | Set color theme by name | View > Themes menu (e.g., `[theme:set dracula]`) |
| `[theme:cycle]` | Cycle to next theme | — |

Available theme names: `retro-green`, `dark-plus`, `one-dark-pro`, `monokai-pro`, `dracula`, `solarized-dark`, `github-dark`, `light-plus`, `cyberpunk`, `synthwave`, `vaporwave`, `matrix`, `hot-dog`, `ocean-depths`, `sunset`, `tokyo-night`, `midnight-purple`, `gold-royal`

---

## Actions Without TCL Commands

The following actions are handled directly and do not have TCL equivalents (they involve complex state or selection logic):

| Action | Keyboard Shortcut | UI Equivalent |
|--------|-------------------|---------------|
| Copy selection | `Cmd+C` / `Ctrl+Shift+C` | Edit > Copy menu |
| Paste | `Cmd+V` / `Ctrl+Shift+V` | Edit > Paste menu |
| Clear selection | `Escape` | — |
| Interrupt (SIGINT) | `Cmd+C` (no selection) / `Ctrl+C` | — |
| Select text | — | Click and drag in terminal |
| Select word | — | Double-click in terminal |
| Select line | — | Triple-click in terminal |
| Focus pane | — | Click in a pane (split layouts) |
| Focus tab from dashboard | — | Click a tab card in dashboard view |
| Close tab from dashboard | — | Click `x` on a tab card in dashboard |
| Normal terminal view | — | Click the terminal prompt icon button in title bar |
| Crazy effects | — | Click the circus tent emoji button in title bar |

---

## Command Palette

The command palette (`Cmd/Ctrl+Shift+P`) provides a searchable interface to all registered TCL commands.

### Usage

1. Press `Cmd/Ctrl+Shift+P` to open
2. Type to filter commands (fuzzy matches on both command ID and label)
3. Use `Up/Down` arrows to navigate results
4. Press `Enter` to execute the selected command
5. Press `Escape` to dismiss

### Direct TCL Entry

You can type a full TCL command directly in the palette:

```
[tab:new vertical]
```

If the input matches the `[category:action]` pattern, it executes immediately without fuzzy matching.

---

## History & Replay

### What Gets Recorded

Each tab maintains its own history with two types of entries:

| Entry Type | Recorded When | Example |
|------------|---------------|---------|
| **Shell command** | User presses Enter at shell prompt (no child processes running) | `git status` |
| **App command** | Any TCL command is executed (via shortcut, palette, or button) | `[crt:toggle]` |

**Not recorded:**
- Keystrokes inside interactive programs (vim, python REPL, etc.)
- Copy/paste actions
- Mouse selections

### Replay File Format

```
# TermLife session replay
# Saved: 2026-03-06T14:30:00.000Z

cd ~/projects/termlife-app
npm install
[tab:new vertical]
npm run dev
[theme:set dracula]
git status
[crt:toggle]
```

- Lines starting with `#` are comments (ignored during replay)
- Lines starting with `[` and ending with `]` are app commands
- All other non-empty lines are shell commands
- Shell commands are sent to the PTY with a carriage return
- The engine waits for each shell command to complete before sending the next

### Replay Invocation

```bash
termlife --replay=session.txt
termlife -f session.txt
```

---

## Syntax Reference

### Grammar

```
TCL_COMMAND  = "[" CATEGORY ":" ACTION [ARGS] "]"
CATEGORY     = "tab" | "split" | "theme" | "crt" | "matrix"
             | "dashboard" | "filebrowser" | "history" | "palette" | "scroll"
ACTION       = identifier (e.g., "new", "toggle", "set", "switch")
ARGS         = space-separated strings (e.g., "vertical", "dracula", "5")
```

### Examples

```
[tab:new]                    # New tab, single pane
[tab:new vertical]           # New tab, vertical split
[tab:switch 3]               # Switch to tab 3
[theme:set monokai-pro]      # Set theme
[crt:toggle]                 # Toggle CRT effect
[scroll:up]                  # Scroll up 5 lines
[history:toggle]             # Toggle history view
```
