# TubePilot Reactions — Multi-Phase Plan

## Phase 1: Live Composite Preview ✅ → Rework
**Status:** Foundation built (offscreen engine, service worker, manifest, UI shells). Needs rework to move compositing from hidden offscreen document to visible canvas with live preview.

**Goal:** User sees themselves composited on top of the YouTube tab capture in real time.

**Key changes:**
- Move canvas rendering from offscreen.js into reactions.html (visible page)
- Keep offscreen document only for MediaRecorder + audio mixing
- OR stream canvas frames from offscreen → visible tab via messaging
- Live preview shows the exact output that will be recorded

---

## Phase 2: Interactive PiP — Drag, Resize, Shape
**Goal:** User can freely position and resize their webcam overlay with mouse interaction, choose shapes.

**Key features:**
- Drag-and-drop webcam overlay anywhere on the canvas (not just 4 corners)
- Resize handles (corner drag to scale)
- Shape selector: rectangle, rounded rectangle, circle
- Border customization: color picker, thickness slider
- Snap-to-corner guides (optional magnetic snapping)
- All changes reflected in live preview and recorded output in real time

---

## Phase 3: AI Background Removal
**Goal:** Remove webcam background in real-time so the reactor "floats" over the video content.

**Key features:**
- TensorFlow.js with MediaPipe Selfie Segmentation (runs in browser, no server)
- Toggle on/off
- Edge smoothing / feathering controls
- Optional background blur (alternative to full removal)
- Performance monitoring (fall back gracefully on low-end hardware)

---

## Phase 4: Layout Presets & Webcam-Only Mode
**Goal:** One-click layout templates and a copyright-safe recording mode.

**Key features:**
- Layout presets: PiP (any corner), side-by-side 50/50, reactor-over-content (requires BG removal)
- Webcam-only mode: records only the reactor's face+audio, no tab capture
- Sync link generation: produces a timestamped link viewers can use with sync extensions
- Layout preset thumbnails for easy visual selection

---

## Phase 5: Post-Recording Enhancements
**Goal:** Polish the output before download/upload.

**Key features:**
- Trim start/end before exporting
- Auto-captions (Web Speech API or Whisper-based)
- Silence detection and removal
- Title/description editor before YouTube upload
- Thumbnail generation from any frame

---

## Phase 6: Overlay Graphics & Customization
**Goal:** Make reactions visually distinctive and branded.

**Key features:**
- Custom overlay frames/borders (preset library)
- Text overlays (name tag, subscribe reminder)
- Emoji/sticker reactions (animated overlays)
- Intro/outro bumpers
- Custom branding (logo watermark)

---

## Implementation Order
Phases 1-2 are the critical rework — they make the feature genuinely usable.
Phase 3 is the key differentiator — no browser extension offers this today.
Phases 4-6 are iterative polish.

Each phase will go through detailed planning (plan mode) before implementation.
