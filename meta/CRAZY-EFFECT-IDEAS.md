# Crazy Effect Ideas

Brainstormed ideas for GPU-accelerated visual effects. Philosophy: effects should enhance **active use**, not reward idleness. Everything is triggered by user action.

---

## Typing Effects

### Fire Trail
Cursor leaves a brief flame particle trail as it moves across the line.

### Platform Game Typing
A little sprite (cursor mascot) runs along the text line and has to jump over obstacles. Characters don't render until the sprite reaches them. Completely impractical, completely fun.

---

## Deletion Effects

### Snow Shovel / Bulldozer
A sprite pushes deleted characters left-to-right (or right-to-left for backspace). They pile up at the screen edge and crumble off-screen.

### Gravity Drop
Deleted characters fall downward with rotation and fade, like crumbling bricks.

### Thanos Snap / Disintegration
Characters break into pixel particles that drift away.

### Shredder
Characters get pulled down into a paper shredder at the bottom of the screen.

---

## Error Explosions

Triggered when a command exits with a non-zero exit code. Intensity could scale with severity (typo = small puff, segfault = full explosion).

### Center Explosion
Characters blast outward from the error line, then reassemble after ~1 second.

### Shockwave
A ripple distortion ring expands from the error location. Cheap as a GLSL shader.

### Screen Shake + Sparks
Quick violent shake with red-orange particle sparks at the cursor position.

### Shatter
The entire screen cracks like glass from the error point, holds for a beat, then the shards fall away revealing the normal state.

### Recommended Combo
**Shockwave + screen shake** — most impactful with the least complexity. Shockwave is a GLSL filter, screen shake is just offsetting the container for a few frames.

---

## Tab Transition Effects

### 3D Page Flip
Fake perspective transform via mesh distortion (PixiJS SimpleMesh).

### Dissolve / Burn
Old tab burns away from an edge with a fire particle effect, revealing the new tab.

### Glitch Transition
RGB split + horizontal slice displacement for ~200ms.

### Matrix-Style
Old tab characters rain down while new tab characters rain in from top.

### Portal
Circular wipe that looks like a sci-fi iris opening.

### Shatter
Old tab breaks into triangular shards that fall away.

---

## Physics-Based Effects

### Snowflake Accumulation
Snowflake sprites fall, bounce off text characters (AABB collision against occupied cells), pile up from the bottom. When a line scrolls, the snow shifts. Reusable physics system.

### Water Fill
Shader-based rising blue-tinted wave with a sine-distorted surface line. Characters below the waterline get wobble distortion + tint. Characters "float" up as water rises. Could drain when you type `clear`.

### Gravity Mode
Empty cells "fall" and text stacks at the bottom like Tetris blocks. Could trigger on idle or on command.

### Character Magnetism
Mouse cursor attracts/repels nearby characters like a magnet field.

---

## Command-Aware Effects

### Earthquake
On `rm -rf` or other dangerous commands, screen shakes violently.

### Celebration Particles
Confetti or fireworks when a long-running command completes successfully.

---

## Configuration Design

All effects are controlled by a single `EffectsConfig` object that can be persisted to disk and modified at runtime via a settings UI.

```typescript
export interface EffectsConfig {
  // --- Existing effects ---
  crt: boolean                                          // CRT scanline filter
  matrixRain: boolean                                   // Matrix rain overlay

  // --- Typing effects ---
  typingEffect: 'none' | 'fire-trail' | 'platform-game' | 'random'

  // --- Deletion effects ---
  deleteEffect: 'none' | 'snow-shovel' | 'gravity-drop' | 'thanos-snap'
                | 'shredder' | 'random'

  // --- Error effects ---
  errorEffect: 'none' | 'explosion' | 'shockwave' | 'shake-sparks'
               | 'shatter' | 'shockwave-shake' | 'random'
  errorIntensity: 'fixed' | 'scale-with-severity'      // scale = bigger boom for segfault

  // --- Tab transition effects ---
  tabTransition: 'none' | 'instant' | 'page-flip' | 'dissolve-burn'
                 | 'glitch' | 'matrix-style' | 'portal' | 'shatter' | 'random'
  tabTransitionDuration: number                         // ms, default 300

  // --- Physics / ambient effects ---
  ambientEffect: 'none' | 'snowflakes' | 'water-fill' | 'gravity-mode'
                 | 'magnetism' | 'random'

  // --- Command-aware effects ---
  dangerCommandShake: boolean                           // earthquake on rm -rf etc
  successCelebration: boolean                           // confetti on long command success

  // --- Global ---
  effectsEnabled: boolean                               // master kill switch
  particleDensity: 'low' | 'medium' | 'high'           // GPU budget knob
}
```

**Persistence**: Save as JSON to `~/.config/termlife/effects.json` via Electron main process IPC. Renderer requests config on startup, sends updates on change.

**Runtime modification**: A settings panel (or keyboard shortcut cycle) lets you change any value. Changes apply immediately and auto-save.

**`random` option**: For any category, `random` picks a different effect each time the trigger fires — keeps things surprising.

---

## Feasibility

| Effect | Effort | Compute | Fun Factor |
|--------|--------|---------|------------|
| Gravity drop on delete | Low | Low | High |
| Glitch tab transition | Low | Low | High |
| Shockwave + shake on error | Low | Low | Very high |
| Fire trail on cursor | Low | Low | Medium |
| Snow accumulation | Medium | Medium | Very high |
| Water fill shader | Medium | Low (GPU) | High |
| Dissolve/burn transition | Medium | Medium | Very high |
| 3D page flip | Medium | Low (mesh) | High |
| Thanos snap delete | Medium | Medium | Very high |
| Platform game typing | High | Low | Absurd |
