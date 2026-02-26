# TubePilot Reactions — Multi-Phase Plan

> Each phase goes through detailed planning (plan mode) before implementation.
> Reference mockup: `reactions/mockup.html`

---

## Technical Foundation

### Rendering Engine: PixiJS

All visual compositing uses **PixiJS** (WebGL 2D renderer) from Phase 1 onward.

**Why PixiJS:**
- GPU-accelerated rendering — video textures, masks, filters, blend modes all run on GPU
- Scene graph with layers — video layer, PiP layer, overlay layer, text layer
- Handles 1080p/30fps+ compositing without frame drops
- BG removal masks applied as GPU textures via shaders (Phase 5)
- Blur, color correction, chroma key are trivial fragment shaders
- Scales to 4K output, multi-cam, animated overlays without CPU bottlenecks
- ~500KB, loaded once in the full-tab reactions page (size is not a concern)

**Why not alternatives:**
- *Konva.js / Fabric.js* — Canvas 2D only. Fine for Phases 1-4, but hits a wall at Phase 5+ where per-frame pixel manipulation (BG removal, blur, filters) becomes CPU-bound. Would require painful migration later.
- *Raw Canvas 2D* — Same CPU limitations. Also requires building drag/resize/hit-testing from scratch.
- *Raw WebGL + custom shaders* — Maximum performance but enormous development effort for scene management, event handling, text rendering.

### Video Capture: Dedicated Player Tab + Tab Capture

YouTube's IFrame Player API is cross-origin sandboxed — we cannot read its pixels directly. To get smooth, frame-accurate video into our PixiJS canvas:

**Primary approach (Solution D — Dedicated Player Tab):**
1. User searches/selects a video in the reactions page
2. Extension opens a background tab with `youtube-player.html?v={videoId}` — a minimal full-viewport YouTube embed, no other UI
3. `chrome.tabCapture.getMediaStreamId()` captures that tab → clean MediaStream of just the video
4. MediaStream feeds into PixiJS as a video texture via `requestVideoFrameCallback` — frame-perfect, no chop
5. Reactions page controls playback by messaging the player tab (play, pause, seek, load new video)
6. When user queues a new video, the player tab loads it — the capture stream stays connected, content changes seamlessly
7. MediaRecorder captures the PixiJS canvas (video texture + webcam + overlays) — all GPU composited

**Why this works:**
- MediaStream from tab capture is a real video stream (like a webcam), not screenshots
- `requestVideoFrameCallback` syncs texture updates to actual video framerate
- PixiJS uploads the frame to GPU as a texture — near-zero CPU cost
- User never sees the player tab; the reactions page is the only interface
- Recording only captures what PixiJS renders — no browser chrome, no search UI, no navigation
- Switching videos in the queue just tells the player tab to load a new ID — stream stays alive

### Fallback Approaches (documented for reference)

If the primary approach hits issues, these are alternatives to try:

**Fallback A: Layered DOM (iframe behind, PixiJS canvas on top)**
- YouTube iframe renders natively, PixiJS canvas with transparent BG sits on top drawing only webcam + overlays
- Smooth playback for both layers
- Limitation: MediaRecorder can only capture one canvas, so recording won't include the YouTube video
- Could work for "webcam-only mode" (Phase 6) where the video isn't in the output
- Not viable for the composite recording use case

**Fallback B: Direct video URL extraction**
- Extract YouTube's direct MP4/WebM stream URL, load as a regular `<video>` element
- Full pixel access, can draw to canvas at native framerate
- Problems: violates YouTube ToS, URLs expire, unreliable across video types
- Only consider as absolute last resort

**Fallback C: Hybrid iframe + tab capture**
- YouTube iframe embedded in a visible tab (user can see it)
- Tab capture that same tab for the video stream
- Risk: if the tab has any UI outside the player, it leaks into the recording
- Less clean than Solution D but simpler to implement

**Fallback D: Screen capture via getDisplayMedia**
- Use `getDisplayMedia()` to let user pick a screen/window to capture
- Works universally but requires user to manually select the window
- No programmatic control over what's captured
- Poor UX, but useful as a "capture anything" escape hatch for non-YouTube content

---

## Phase 1: Core Architecture & Live Preview

**Goal:** Build the rendering foundation. User sees a live composite preview (YouTube video + webcam PiP) on a visible PixiJS canvas. Recording captures the composite.

**Scope:**
- Set up PixiJS renderer in reactions page (WebGL canvas, 1920x1080)
- Dedicated YouTube player tab (`youtube-player.html`) with full-viewport embed
- Tab capture the player tab → MediaStream → PixiJS video texture (via `requestVideoFrameCallback`)
- Webcam stream → PixiJS video texture for PiP layer
- PixiJS scene: background video sprite (full canvas) + PiP webcam sprite (positioned in corner)
- MediaRecorder captures `canvas.captureStream(30)` + mixed audio
- Basic playback controls wrapping the IFrame API via messaging (play, pause, seek)
- Service worker: tab capture orchestration, recording state management, broadcasts to all surfaces
- Top bar with recording controls (record, pause, stop, timer)
- View toggle: Final Cut / Camera / Video Only (changes what the user sees, recording always captures composite)
- Load a video by ID to validate the full pipeline end-to-end

**Depends on:** Existing foundation (manifest permissions, state machine, service worker handlers)

---

## Phase 2: Interactive PiP — Drag, Resize, Shape

**Goal:** User can freely position, resize, and style their webcam overlay by interacting directly with the PixiJS canvas.

**Scope:**
- Mouse/touch event handling on the PixiJS stage for PiP sprite
- Drag to move PiP anywhere on the canvas
- Corner resize handles to scale PiP (maintain aspect ratio)
- Shape masking on the PiP sprite: rectangle, rounded rectangle, circle (PixiJS Graphics as mask)
- Border rendering: color picker (preset swatches + custom), thickness slider
- PiP size slider (10%-45% of canvas width)
- Snap-to-corner guides (optional magnetic snapping to edges/corners)
- All changes reflected live in preview and in the recorded output
- Style tab in sidebar (shape, border, size controls from mockup)

---

## Phase 3: Video Queue & YouTube Search

**Goal:** Users can search YouTube, build a queue of videos, and play through them. Browsing/searching never appears in the recorded output.

**Scope:**
- YouTube Data API `search.list` integration (add to `youtube-api.js`, 50 quota units/call)
- Search bar in sidebar Queue tab
- Search results with thumbnails, titles, channel names, view counts
- "Now Playing" display with current video info
- "Up Next" queue — add, reorder (drag), remove videos
- Click a search result → adds to queue (or plays immediately if nothing playing)
- When current video ends, auto-load next video in the player tab (stream stays connected)
- Prev/Next buttons in player controls
- Queue persists during pause/resume
- Handle non-embeddable videos gracefully (skip with message)
- Video transitions: brief blank/freeze frame (user can manually pause for clean cuts)

---

## Phase 4: Camera Settings & Audio Mixing

**Goal:** Full device management and audio controls in the Camera sidebar tab.

**Scope:**
- Camera/mic device enumeration and selection dropdowns
- Live camera-only preview in the Camera tab (full device feed)
- YouTube volume slider (controls IFrame player volume via API + audio mix gain)
- Mic volume slider (controls mic gain in audio mix)
- YouTube volume always accessible in sidebar footer
- Audio mixing: tab capture audio (YouTube) + mic audio via AudioContext/GainNode → MediaStream destination
- Mic mute toggle
- Camera flip/mirror option
- Device hot-swap (change camera/mic during recording without stopping)

---

## Phase 5: AI Background Removal

**Goal:** Real-time webcam background removal so the reactor "floats" over the video. Key differentiator — no browser extension offers this.

**Scope:**
- MediaPipe Selfie Segmentation running in browser (loaded on-demand when toggled on)
- Segmentation outputs a mask texture → applied to PiP sprite via PixiJS shader/mask
- GPU-accelerated mask compositing (not CPU pixel loops)
- Toggle on/off in Style tab
- Edge smoothing / feathering slider (shader-based Gaussian blur on mask edges)
- Optional background blur (alternative to full removal — blur shader behind person)
- Performance monitoring with automatic quality fallback (lower resolution, reduced framerate)
- Handle low-end hardware gracefully (show warning, suggest disabling)

---

## Phase 6: Layout Presets & Webcam-Only Mode

**Goal:** One-click layout templates and a copyright-safe recording mode.

**Scope:**
- Layout preset thumbnails: PiP (each corner), side-by-side 50/50, reactor-over-content (uses BG removal)
- Clicking a preset applies PiP position, size, and shape in one click
- Webcam-only mode: records only the reactor's face + audio, video layer hidden from recording
- Sync link generation: produce a timestamped URL viewers can use with sync extensions (Reactify, Reaction Channels)
- Preset selector UI (visual thumbnails in Style tab or dedicated section)

---

## Phase 7: Recording Output & Upload

**Goal:** After stopping, user can preview, download, and upload the reaction directly to YouTube with metadata.

**Scope:**
- Recording saved to IndexedDB (blob + metadata + thumbnail)
- Output section: video preview player with playback controls
- Download as WebM (filename: `reaction-{timestamp}.webm`)
- Upload to YouTube via existing Data API infrastructure (`videos.insert`)
- Pre-upload form: title, description, category, privacy, made-for-kids
- Upload progress bar (resumable upload for large files)
- Post-upload: link to video, option to open in TubePilot metadata generator
- Auto-cleanup of recordings older than 7 days

---

## Phase 8: Post-Recording Enhancements

**Goal:** Polish the output before export/upload.

**Scope:**
- Trim start/end points before exporting
- Silence detection and removal (auto-cut dead air)
- Auto-captions via Web Speech API or Whisper
- Thumbnail generation: pick any frame as thumbnail
- Title/description AI generation (reuse existing TubePilot metadata generator)

---

## Phase 9: Overlay Graphics & Branding

**Goal:** Make reactions visually distinctive and branded.

**Scope:**
- Custom overlay frames/borders (preset library)
- Text overlays: name tag, subscribe reminder, custom text (PixiJS Text/BitmapText)
- Emoji/sticker reactions (animated sprites on the PixiJS stage)
- Intro/outro bumpers (short clip bookends)
- Custom branding: logo watermark positioning
- Overlay library saved per-user in chrome.storage

---

## Implementation Order

| Priority | Phase | Rationale |
|----------|-------|-----------|
| Critical | 1 — Core Architecture | Everything depends on PixiJS + player tab + live preview |
| Critical | 2 — Interactive PiP | Core UX — makes it feel like a real tool |
| Critical | 3 — Video Queue | Core workflow — users need to find and line up videos |
| High | 4 — Camera & Audio | Essential for usable recordings |
| High | 7 — Output & Upload | Users need to get their recordings out |
| Medium | 5 — Background Removal | Key differentiator, not blocking basic usage |
| Medium | 6 — Layout Presets | Convenience, builds on phases 2+5 |
| Low | 8 — Post-Recording | Polish, can ship without |
| Low | 9 — Overlays & Branding | Polish, can ship without |

**MVP** = Phases 1-4 + 7 (fully functional reaction recording tool)
**Differentiator** = Phase 5 (AI background removal in browser — unique to TubePilot)
**Growth** = Phases 6, 8, 9
