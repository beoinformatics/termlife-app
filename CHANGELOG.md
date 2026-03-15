# Changelog

All notable changes to TermLife will be documented in this file.

The format is based on [Keep a Changelog(!)](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-03-06

### Added

#### Core Terminal
- **GPU-Accelerated Rendering** - Built on _PixiJS_ for smooth, hardware-accelerated terminal rendering with individual text objects per cell and dirty-tracking optimizations
- **ANSI State Machine** - Integrated _@xterm/headless_ for robust ANSI sequence parsing and terminal state management without DOM overhead
- **PTY Integration** - node-pty backend for spawning and managing pseudo-terminal sessions in the main Electron process

#### Multi-Tab System
- **Tab Management** - Create, close, and switch between multiple terminal sessions
  - `Cmd/Ctrl+T` - New tab
  - `Cmd/Ctrl+W` - Close tab
  - `Cmd/Ctrl+1-9` - Switch to tab by index
  - `Shift+Cmd/Ctrl+[` and `]` - Previous/next tab cycling
- **Smart Tab Switching** (`Ctrl+Tab`) - Intelligently switches to tabs based on state:
  - From idle/running tabs: jumps to tabs awaiting input first, then idle, then running
  - From input-awaiting tabs: cycles through other input-awaiting tabs
- **Tab Status Indicators** - Visual emoji indicators showing tab state (running, idle, awaiting input, error)
- **Tab Dragging** - Reorder tabs via drag-and-drop
- **Tab Renaming** - Double-click tab name to rename
- **Tab Death Animation** - Visual feedback when closing tabs

#### Split Panes
- **Four Layout Modes** - Switch between terminal arrangements:
  - Single - One terminal per tab (default)
  - Vertical (`⧧`) - Two sessions side-by-side
  - Horizontal (`⧤`) - Two sessions stacked
  - Quad (`⊞`) - Four sessions in 2×2 grid
- **Pane Dividers** - Visual dividing lines between panes in multi-pane layouts
- **Input Broadcasting** - Keyboard input broadcasts to all panes in the active tab
- **Independent PTYs** - Each pane runs its own isolated PTY session

#### Visual Effects
- **CRT Filter** (`Ctrl+Shift+C`) - GLSL shader simulating vintage CRT displays with:
  - Scanlines
  - Screen glow/bloom
  - Barrel distortion
  - Adjustable intensity
- **Matrix Rain** (`Ctrl+Shift+M`) - Falling green glyph animation overlay
- **Bubble Effect** - Animated bubble particles floating across the terminal
- **Color Themes** - Switch between different terminal color schemes

#### Scrollback & History
- **Scrollback Buffer** - Navigate through terminal history:
  - `Shift+PageUp/PageDown` - Scroll 5 lines at a time
  - `Cmd/Ctrl+Home/End` - Jump to top/bottom
  - Mouse wheel support
- **Status-Aware History** - Properly tracks and displays session status during scrollback

#### Input & Interaction
- **Keyboard Shortcuts** - Full shortcut system for all major operations
- **Copy/Paste** - Clipboard integration:
  - `Cmd/Ctrl+Shift+C` - Copy selection
  - `Cmd/Ctrl+Shift+V` - Paste
- **Text Selection** - Mouse-based text selection with visual feedback
- **Cursor Rendering** - Blinking cursor with proper positioning and visibility handling
- **Bell Support** - Visual bell (emoji indicator) and optional sound notification

#### Dashboard & UI
- **Tab Dashboard** - Grid overview of all open tabs with live previews
- **Window Heading Bar** - Custom-styled title bar with application branding
- **Tooltip Texts** - Informative hover tooltips on UI elements
- **File Browser** - Integrated file browser for navigating the filesystem

#### Application
- **Wrapper Script** - Shell integration for launching TermLife from terminal
- **App Commands** - Internal command system for application control
- **Electron-Vite Build** - Modern build setup targeting main, preload, and renderer processes

[0.3.0]: https://bitbucket.org/solace/termlife/src/v0.3.0
