# TubePilot — Task List

## Pre-Launch Setup
- [ ] Create OAuth2 client in GCP Console (`sam-extension` project) for TubePilot
- [ ] Update `manifest.json` with real OAuth `client_id`
- [ ] Create TubePilot icons (icon16.png, icon48.png, icon128.png, fab-icon.png)
- [ ] Load extension unpacked in Chrome, get dev extension ID
- [ ] Add extension ID to `ALLOWED_EXTENSION_IDS` env var on Cloud Run
- [ ] Deploy backend with new `/api/v1/youtube-generate-meta` endpoint
- [ ] Test auth flow (sign in / sign out / credits display)
- [ ] Test metadata generation on a YouTube Studio edit page
- [ ] Test "Fill Form" on YouTube Studio fields (title, description, tags)
- [ ] Test "Copy All" clipboard fallback
- [ ] Test product CRUD in popup Products tab
- [ ] Verify 1 credit deducted per generation

## Post-MVP / Future
- [ ] Create public docs pages (welcome, privacy, terms, disclaimer)
- [ ] Options page (separate from popup)
- [ ] Channel auto-detection for product matching
- [ ] Thumbnail generation
- [ ] Playlist auto-add
- [ ] API-based video upload (requires Google compliance audit)
- [ ] Chrome Web Store listing + review
