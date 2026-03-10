# TubePilot Reactions — Feature Roadmap

> Upcoming features beyond the original 9-phase plan.
> For the original build plan (Phases 1–9), see `REACTIONS-PLAN.md`.
>
> **Shipped so far:** Phases 1–3 (core, PiP, queue), 5 (AI BG removal), 6 (layouts), 7 (output/upload).
> **Remaining from original plan:** Phase 4 (device hot-swap), 8 (post-recording polish), 9 (overlays/branding).

---

## Feature A: Video Zoom & Pan

**Problem:** Reactors often want to zoom into a specific part of the YouTube video to highlight details — a face, text on screen, a game moment. Currently the video is drawn full-frame with no zoom control.

**Current rendering pipeline:**
- `drawVideoFill()` (`reactions.js:1175`) draws the full video frame cover-fit to canvas
- `ctx.drawImage(video, sx, sy, sw, sh)` — source rect is always the entire frame
- Two-canvas architecture: preview (visible) + recording (hidden, always full composite)
- PiP drag/resize already uses canvas coordinate mapping (`canvasCoordsFromEvent`)

### Design

**Zoom model — source-rect crop:**
Instead of drawing the full video frame, draw a cropped sub-region and scale it to fill the canvas. This is a `drawImage()` 9-argument form change:

```
// Current (no zoom)
ctx.drawImage(video, 0, 0, canvasW, canvasH)

// Zoomed (crop source region, draw to full canvas)
ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH)
```

Where `srcW/srcH = videoW/videoH / zoomLevel` and `srcX/srcY` are the pan offset.

**State variables:**
- `videoZoom` — float, 1.0 (no zoom) to 4.0 (4x)
- `videoPanX`, `videoPanY` — normalized 0.0–1.0, center of the visible region
- Pan is clamped so the viewport can't go outside the video frame

**Scope:**

| Item | Detail |
|------|--------|
| Zoom range | 1x – 4x (beyond 4x quality degrades too much) |
| Zoom control | Mouse wheel on preview canvas (when not hovering PiP) |
| Pan control | Click-drag on video area (when not dragging PiP) |
| Zoom slider | Optional slider in Style tab for precise control |
| Reset | Double-click video area resets to 1x / centered |
| Recording | Zoom state applies to recording canvas identically |
| Side-by-side | Zoom applies to the video half of `drawSideBySide()` |
| Keyboard | `+`/`-` for zoom in/out, arrow keys for pan (stretch goal) |

**Interaction conflict resolution:**
The preview canvas already handles PiP drag/resize via hit-testing. Zoom/pan only activates when the mouse is NOT over the PiP region:

```
mousedown → hitTestPip() ? start PiP drag : start video pan
wheel → hitTestPip() ? ignore : adjust videoZoom
```

**Affected files:**
- `reactions/reactions.js` — `drawVideoFill()`, `drawCanvas()`, `drawSideBySide()`, mouse handlers
- `reactions/reactions.html` — zoom slider in Style tab (optional)
- `reactions/reactions.css` — slider styling

**Complexity:** Low-medium. Core change is small (source-rect math in drawImage). UX polish (wheel zoom, pan, PiP conflict) is the bulk of the work.

**Risk:** Minimal. Zoom is purely a rendering transform — doesn't touch capture, recording, or audio pipelines.

---

## Feature B: Screen / Tab Capture (Beyond YouTube)

**Problem:** Users want to react to content beyond YouTube — Twitch clips, TikTok, educational slides, games in browser tabs, or even desktop applications. Currently the system is YouTube-locked.

**Current capture architecture:**
- `getDisplayMedia()` (`reactions.js:400`) with constraints: `displaySurface: 'browser'`, `monitorTypeSurfaces: 'exclude'`
- Chrome picker already shows ALL browser tabs — user *could* pick any tab
- Content script (`youtube-reactions.js`) injected only into `youtube.com` for playback control
- Playback controls (play/pause/seek) send messages to the content script → YouTube DOM
- Queue system is YouTube Data API search

### What already works with any tab

The rendering and recording pipelines are source-agnostic:
- Canvas compositing (video + webcam PiP) — works with any MediaStream
- MediaRecorder — doesn't care about stream source
- Background removal — processes webcam only, independent of video source
- All layout presets — purely geometric
- Audio mixing — tab audio + mic via AudioContext

### What breaks with non-YouTube sources

| Component | Issue | Fix needed |
|-----------|-------|------------|
| Playback controls | Send messages to YouTube content script | Graceful degradation — disable when source isn't YouTube |
| Seek bar | Reads `currentTime`/`duration` from YouTube DOM | Hide or disable for non-YouTube sources |
| Queue system | YouTube search API | Keep as-is, add separate "Capture Source" entry point |
| Content script CSS | Hides YouTube chrome for clean capture | No-op on other sites (harmless) |
| `monitorTypeSurfaces` | Blocks desktop/monitor capture | Remove constraint to allow all sources |

### Design

**Two entry modes** — the queue/YouTube flow stays intact, plus a new "Capture Source" mode:

1. **YouTube mode (existing):** Search → queue → auto-open YouTube tab → getDisplayMedia picker → content script controls playback. No changes needed.

2. **Screen capture mode (new):** User clicks "Capture Screen" button → getDisplayMedia picker opens immediately (no YouTube tab created) → user picks any tab, window, or monitor → stream feeds into canvas. Playback controls disabled. Queue panel shows "External source" card.

**UI changes:**
- Add "Capture Screen" button in Queue tab (below search bar or as a tab-level toggle)
- When in screen-capture mode:
  - "Now Playing" card shows "Screen Capture" with a generic icon
  - Player controls (play/pause/seek) are disabled/hidden
  - Search bar remains functional for switching to YouTube mode
  - Recording works identically

**getDisplayMedia constraint changes:**
```js
// YouTube mode (current)
{ video: { displaySurface: 'browser' }, monitorTypeSurfaces: 'exclude' }

// Screen capture mode (new)
{ video: true, audio: true }
// Removes all constraints — picker shows tabs, windows, and monitors
```

**Scope:**

| Item | Detail |
|------|--------|
| Entry point | "Capture Screen" button in Queue tab |
| Picker | getDisplayMedia with no surface constraints |
| Sources | Browser tabs, application windows, entire monitors |
| Audio | Tab audio captured if user checks "Share audio" in picker |
| Playback controls | Disabled for non-YouTube sources |
| Queue | Remains YouTube-only; screen capture is a parallel mode |
| Recording | Works identically — MediaRecorder captures canvas composite |
| Layout presets | All work (PiP, side-by-side, etc.) |
| BG removal | Works (webcam-only processing) |
| Manifest | No permission changes needed — getDisplayMedia is a web API |

**Affected files:**
- `reactions/reactions.js` — new `startScreenCapture()` flow, conditional playback controls
- `reactions/reactions.html` — "Capture Screen" button in Queue panel
- `reactions/reactions.css` — button styling, "External source" card
- `background/service-worker.js` — skip YouTube tab creation for screen capture mode
- `services/reactions-state.js` — new state constant for capture mode (YouTube vs Screen)

**Complexity:** Medium. The capture/render pipeline needs zero changes. Work is primarily UX: a new entry flow, conditionally hiding playback controls, and the "screen capture active" state display.

**Risk:** Low. YouTube mode is untouched. Screen capture is an additive code path. No permission changes. The only subtle issue is audio — `getDisplayMedia` tab audio capture requires the user to check "Share audio" in the Chrome picker, which isn't controllable programmatically.

---

## Feature C: YouTube Mix / Playlist Queue Import

**Problem:** When a user pastes a YouTube Mix or playlist URL (e.g. `youtube.com/watch?v=ABC&list=RDABC`), the system extracts only the single video ID and discards the `list=` parameter. The video plays once and stops — no mix continuation, no playlist import.

**Current behavior:**
- `parseVideoId()` extracts only the `v=` param, ignores `list=`
- Embed tab navigates to `watch?v=VIDEO_ID&autoplay=1` — no playlist context
- Auto-advance only fires when `videoQueue.length > 0` — empty queue = video stops
- YouTube's native mix continuation can't help (no `list=` in the URL)

### Design — Option A: API-based playlist fetch

Parse the `list=` parameter, fetch playlist items via YouTube Data API, bulk-add to queue. Works cleanly with the existing queue system.

**Implementation steps:**
1. Modify `parseVideoId()` to return `{ videoId, listId }` (or just `videoId` for non-playlist URLs)
2. Add `RX_FETCH_PLAYLIST` message type in `reactions-state.js`
3. Add service worker handler that calls YouTube Data API `playlistItems.list` endpoint with `listId`
4. Reactions page receives playlist items and bulk-adds to queue via existing `addToQueue()`
5. First video plays immediately, rest populate the queue
6. Show "Playlist loaded (N videos)" status message

**Trade-offs:**
- YouTube Mixes are dynamically generated — API snapshot may differ from what YouTube would show natively
- Requires YouTube Data API quota (already used for search)
- Some playlists may be private/unlisted and fail to fetch

**Why not Option B (preserve `list=` in URL, let YouTube handle continuation):**
Would require rethinking content script navigation detection, create dual-control conflicts between YouTube's autoplay and TubePilot's queue, and risk race conditions. Much larger surface area for minimal UX gain.

**Affected files:**
- `services/queue-storage.js` — `parseVideoId()` returns `{ videoId, listId }`
- `services/reactions-state.js` — new message type
- `background/service-worker.js` — playlist fetch handler
- `reactions/reactions.js` — playlist detection + bulk queue add in `handleSearchInput()`

**Complexity:** Low. Builds entirely on existing patterns (API calls, queue management).

---

## Feature D: Device-Native Acceleration Research

> Research findings as of March 2026. Informs future architecture decisions.

### Current stack

TubePilot uses **MediaPipe Selfie Segmenter (WASM + GPU delegate)** for background removal. This is close to optimal for web-based segmentation today.

### What's accessible from Chrome / Extensions TODAY

| API / Feature | Status | Relevance |
|---|---|---|
| **WebGPU** | Shipped (Chrome 113+) | Full GPU compute. 3-10x faster than WebGL for ML. Works in extensions. |
| **MediaPipe WASM+GPU** | Library (current stack) | <3ms inference on desktop. Mobile GPU delegate has known Android bugs. |
| **TensorFlow.js (WebGPU backend)** | Library | Alternative to MediaPipe. Worth benchmarking — could be faster on Android 12+. |
| **ONNX Runtime Web (WebGPU)** | Library | Run custom ONNX segmentation models with GPU acceleration. |
| **Insertable Streams (Breakout Box)** | Shipped (Chrome 94+) | Raw video frame processing pipeline. Cleaner than canvas-based approach. |
| **ImageCapture API** | Shipped (Chrome 59+) | Camera controls: zoom, torch, focus, exposure, white balance. |
| **BarcodeDetector** | Shipped (Chrome 83+) | Platform-native barcode detection. Niche but available. |
| **Chrome Built-in AI (Prompt API)** | Shipped for extensions (Chrome 138+) | Gemini Nano for text tasks (title/description generation). Desktop only. Free, no API credits. |

### What's NOT accessible (device-native AI is walled off)

| Feature | Why not |
|---|---|
| **Samsung/Qualcomm NPU** | No web API. WebNN on Android is CPU-only, Origin Trial only. |
| **Portrait mode / HDR / Night mode** | Native camera app computational photography — not exposed to web. |
| **FaceDetector API** | Behind experimental flag. Can't require users to flip flags. |
| **backgroundBlur constraint** | Experimental flag. OS-level blur, not device portrait mode. |
| **WebNN (GPU/NPU)** | Origin Trial (Chrome 146-148). Android = CPU only. Not production-ready. |

### Actionable upgrades

1. **WebGPU backend for segmentation** — Benchmark TensorFlow.js or ONNX Runtime with WebGPU vs current MediaPipe WASM+GPU. Could yield 3x speedup on desktop and improve Android performance where MediaPipe GPU delegate has issues.
2. **Chrome Built-in AI for text generation** — Replace or supplement the paid `/api/v1/youtube-generate-meta` endpoint with free on-device Gemini Nano for title/description generation. Desktop only, but saves API credits.
3. **ImageCapture API camera controls** — Expose zoom, torch, focus mode in the Camera tab for users on mobile or with supported webcams. Low effort, adds polish.
4. **Watch WebNN** — When it ships stable with GPU support (~late 2026+), it could provide faster inference without bundling 22MB of WASM models. Android GPU/NPU will lag further.

### Bottom line

The web cannot access device-specific AI hardware (Samsung NPU, computational photography). The best acceleration path today is **WebGPU** — which is shipped, stable, and 3-10x faster than WebGL for ML workloads. TubePilot's current MediaPipe stack is solid; the next optimization step is benchmarking WebGPU-based alternatives.

---

## Priority & Sequencing

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **High** | A — Video Zoom | Small scope, high user value, no architectural risk |
| **High** | B — Screen Capture | Opens TubePilot to non-YouTube content creators, moderate scope |
| **High** | C — Playlist/Mix Queue | Low effort, fixes broken UX when users paste playlist URLs |
| Medium | Phase 9 — Overlays & Branding | Original plan — text overlays, stickers, watermarks |
| Medium | Phase 8 — Post-Recording Polish | Original plan — trim, silence removal, captions |
| Medium | D — Device Acceleration | Benchmark WebGPU alternatives, add Chrome Built-in AI for text |
| Low | Phase 4 — Device Hot-Swap | Original plan — camera/mic switching mid-recording |

**Suggested order:** C → A → B → D → 9 → 8 → 4

Feature C is quick and fixes a real UX gap. A and B add high-value capabilities. D is research/optimization that can be done incrementally. Phases 9, 8, 4 are polish.

---

## Notes

- **Zoom + Screen Capture synergy:** Zoom becomes even more valuable with screen capture — users capturing a desktop or game window often want to zoom into a region.
- **No manifest changes required** for A, B, or C.
- **All features are free-tier** — no credit cost, consistent with the current Reactions model.
- **Chrome Built-in AI** (Feature D) could eliminate API credit cost for title/description generation on desktop.
