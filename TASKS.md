# TubePilot — Task List

## Pre-Launch Setup
- [x] Create OAuth2 client in GCP Console (`sam-extension` project) for TubePilot
- [x] Update `manifest.json` with real OAuth `client_id`
- [ ] Create TubePilot icons (icon16.png, icon48.png, icon128.png, fab-icon.png)
- [x] Load extension unpacked in Chrome, get dev extension ID
- [x] Add extension ID to `ALLOWED_EXTENSION_IDS` env var on Cloud Run
- [x] Deploy backend with new `/api/v1/youtube-generate-meta` endpoint
- [x] Test auth flow (sign in / sign out / credits display)
- [x] Test metadata generation on a YouTube Studio edit page
- [x] Test "Fill Form" on YouTube Studio fields (title, description, tags)
- [ ] Test "Copy All" clipboard fallback
- [x] Test product CRUD in popup Products tab
- [x] Verify 1 credit deducted per generation
- [x] Test upload automation (file select, metadata fill, visibility, publish)

## Completed
- [x] Phase 2: YouTube Data API secondary integration (strategy dispatcher)
- [x] Upload automation wizard (file select → fill → next → checks → visibility → save)
- [x] Inline product creation in panel (+ button, slide-down form)
- [x] Simplified popup product form (removed AI generate, benefits, scenarios)
- [x] Product SEO keywords → Gemini prompt integration
- [x] Video file validation (format, MIME type, size)
- [x] YouTube character limit enforcement (title 100, desc 5000, tags 30/500)
- [x] Extension context invalidated error handling
- [x] Fix deploy script (--update-env-vars, project safety check)
- [x] Fix Show More toggle (click inner button, retry, verify expansion)
- [x] Fix tag filling (chip-bar input pattern, clear defaults first)
- [x] Fix Gemini prompt (no fake timestamps, deduplicate hashtags, less hype)

## Phase 3: YouTube Channel API Integration

### Foundation (backend + API layer)
- [x] #18 — Add channel & playlist fetch methods to YouTubeApiService
- [x] #19 — Add service worker message handlers for channel data

### Scope & Data Flow
- [x] #20 — YouTube scope prompt on first panel open

### Panel UI
- [x] #21 — Channel profile header: avatar, name, subscribers
- [x] #22 — Playlist dropdown populated from API
- [x] #23 — Advanced section: language, comments, paid promo, AI disclosure, Made for Kids

### AI Integration
- [x] #24 — Auto-populate channel context for AI generation
- [x] #25 — Update Gemini prompt with structured channel data

### Upload Automation
- [x] #26 — Pre-upload channel verification
- [x] #27 — Apply playlist during upload wizard via API
- [x] #28 — Apply advanced settings during upload via DOM (paid promo, altered content, comments, language)

### Deployment
- [x] #29 — Deploy backend with prompt updates

## Phase 4: Public Release Readiness

### Google OAuth & YouTube API Compliance
- [x] Add YouTube scopes (`youtube.force-ssl`, `youtube.upload`) to manifest.json
- [x] Create public docs site (homepage, privacy policy, terms of service) in `docs/`
- [x] Enable GitHub Pages at `https://smythmyke.github.io/TubePilot`
- [x] Make repo public (required for free GitHub Pages)
- [x] Add YouTube API quota tracking (daily usage in chrome.storage)
- [x] Add 30-day data freshness enforcement (YouTube API ToS)
- [ ] Configure OAuth consent screen in GCP Console (app name, logo, homepage, privacy policy URL)
- [ ] Record OAuth demo video (consent flow + feature walkthrough)
- [ ] Submit Sensitive Scope Verification to Google

### Chrome Web Store
- [ ] Create TubePilot icons (icon16.png, icon48.png, icon128.png, fab-icon.png)
- [ ] Prepare Chrome Web Store listing (screenshots, description, category)
- [ ] Write permissions justification (identity, activeTab, host_permissions)
- [ ] Publish to Chrome Web Store
- [ ] Chrome Web Store review

## Post-MVP / Future
- [ ] Thumbnail file picker (select thumbnail alongside video)
- [ ] Schedule publishing (date/time picker for visibility)
- [ ] Options page (separate from popup)
- [ ] Thumbnail generation (AI)
- [ ] API-based video upload (requires Google compliance audit + quota increase)
- [ ] Quota increase request (after compliance audit)
