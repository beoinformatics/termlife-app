# Attention-Based Tab Switching — Specification

## Vision

When vibe coding, you run multiple AI agents in parallel tabs — each thinking, generating code, running commands, and occasionally waiting for your input. You can't watch them all. **Attention scoring is your AI stage director**: it monitors all tabs and surfaces the one that most needs your attention, at the right moment, without interrupting your flow.

No other terminal does this.

---

## Current Implementation

### What's Implemented

**Scoring always runs** — no on/off toggle. From the moment the first tab is created, the `AttentionScorer` accumulates signals for all tabs in the background.

**Manual jump** (`Ctrl+Shift+I` or the `⚡` toolbar button) — instantly switches to the highest-scoring non-active tab. Falls back to `controlTab` behavior if no tab has a score above the minimum threshold.

**Score bars** — a thin colored bar at the bottom of each inactive tab shows its current attention score (green → yellow → orange → red).

**Toolbar button glow** — the `⚡` button pulses when any tab scores ≥ 60.

**Background state machine ticking** — all background tabs run `updateStateMachineOnly()` each frame so their state is up to date for scoring, without paying the full rendering cost.

---

## Attention Signals

All signals are additive. The final tab score = `(sum of active signals) × recencyMultiplier + inactivityBonus`.

| Signal | Weight | Trigger | Cleared when |
|--------|--------|---------|--------------|
| `runningInput` | 100 | State → `running-input` or `running-input-alert` | State leaves those states |
| `idleError` | 80 | State → `idle-error` | State leaves `idle-error` |
| `bell` | 70 | Bell received from PTY | `clearBell()` called (tab viewed) |
| `longCommandComplete` | 50 | `running` → `idle-ready`, command ran > 30s | Tab viewed |
| `outputBurst` | 40 | >256 bytes after ≥5s silence | 10s after burst detected, or tab viewed |
| `commandComplete` | 30 | `running` → `idle-ready`, command ran ≤ 30s | Tab viewed |
| `highErrorRate` | 20 | Error rate > 30% over ≥ 3 commands | Error rate drops below threshold |
| Inactivity bonus | up to 30 | Continuous — scales with time since last viewed | Resets on tab view |

All weights are configurable via `AttentionScorer.setWeights()`.

---

## Recency Suppression (S-Curve)

Rather than a hard cooldown, scores are suppressed by a recency multiplier immediately after viewing a tab:

```
recencyMultiplier = sigmoid(timeSinceViewed, midpoint=90s)
  ≈ 0.0  at   0s  (just viewed)
  ≈ 0.12 at  30s
  ≈ 0.5  at  90s  (midpoint)
  ≈ 0.88 at 150s
  ≈ 1.0  at 180s+ (full score restored)
```

On view, all transient signals (`commandComplete`, `longCommandComplete`, `outputBurst`) are cleared immediately. All remaining signals are halved; any decayed below 5 are removed.

---

## Inactivity Bonus

A separate inactivity bonus grows independently of signals:

```
inactivityBonus = sigmoid(timeSinceViewed, midpoint=150s) × 30
  ≈ 0   at   0s
  ≈ 15  at 150s (midpoint)
  ≈ 30  at 300s+ (capped)
```

This ensures tabs that haven't been visited in a long time always surface even when they have no active signals.

---

## Jump Decision (`jumpToMostImportant`)

```
candidates = tabs
  .exclude(activeTab)
  .filter(score > minimumThreshold=20)
  .sort(score descending)

if candidates[0] exists:
  switch_to(candidates[0])
  log reason + score
else:
  fall back to controlTab() (existing smart-tab logic)
```

No typing guard, no pulse preview, no confirmation. The jump is instant.

---

## Output Velocity Tracking

A 1-second interval calls `AttentionScorer.tickVelocity()` on all tabs:
- Accumulates bytes received per tab in a rolling ~1s window
- If a tab received >256 bytes and was previously silent → `outputBurst` signal set
- Burst signal cleared after 10s of inactivity
- Window resets each tick; `wasSilent` flag updated

---

## Urgency-Based Tick Interval

`getOptimalTickInterval()` returns a suggested poll interval based on current scores (used by callers, not internally enforced):

| Highest Pending Score | Interval |
|----------------------|----------|
| ≥ 100 (critical) | 2s |
| ≥ 60 (high) | 5s |
| ≥ 30 (medium) | 10s |
| < 30 (low) | 15s |
| 0 | 0 (paused) |

---

## Visual Indicators

### Tab Bar
- **Score bar** — thin bar at bottom of each inactive tab, proportional to score (clamped at 150 for display), color-coded:
  - `score < 30` → green (`#44aa44`)
  - `30 ≤ score < 60` → yellow (`#aaaa44`)
  - `60 ≤ score < 100` → orange (`#dd8844`)
  - `score ≥ 100` → red (`#dd4444`)
- Score bar only visible when `autoSwitchEnabled` is true (i.e., at least one tab exists)

### Toolbar Button (`⚡`)
- Glow animation active when `getMostNeedsAttention()` returns score ≥ 60
- Tooltip: "Jump to important tab"

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Jump to highest-scoring tab |
| `Ctrl+Tab` | Smart tab switching (existing — prioritizes `running-input` tabs) |

---

## Configuration API

```typescript
// Adjust signal weights
attentionScorer.setWeights({
  runningInput: 100,
  idleError: 80,
  bell: 70,
  longCommandComplete: 50,
  outputBurst: 40,
  commandComplete: 30,
  highErrorRate: 20,
  inactivity: 10,
})

// Adjust minimum score threshold for jump candidates
attentionScorer.setMinimumThreshold(20)
```

---

## Not Yet Implemented (Future Work)

The following were in earlier design iterations but are not implemented:

- **Auto mode** — automatic switching on a timer without user action
- **Notify mode** — pulse tab badge without switching
- **Confirm mode** — prompt before switching with Y/N/Snooze
- **Typing guard** — suppress switches while user is actively typing
- **Pulse preview** — 500ms animation before switch
- **Origin breadcrumb** — "← Tab Three" fade-out after switch
- **Ctrl+Shift+A** — mode cycling shortcut
- **Configuration persistence** — saving weights/threshold across sessions
- **Status bar integration** — per-mode status bar content

---

## Success Criteria

- User running 3+ AI sessions can glance at the tab bar to immediately see which tabs need attention
- `Ctrl+Shift+I` always takes you to the highest-value tab, not just the first `running-input` one
- Tabs that were just visited don't immediately re-compete for top spot
- Tabs left unvisited for minutes always surface even without active signals
- Score bars update continuously — the bar width and color tell the story at a glance
