# SERVICING — WritingApp

Living document updated after each Devin session. Describes current state,
known issues, and how to fix them.

## Current state (session 1 — 2026-08-24)

A typing-practice PWA inspired by Human Benchmark's Writing/Typing test, with
extras for learning. Built to match the mood_tracker app pattern (dark theme,
GitHub Pages PWA, optional GitHub Gist sync).

### What works
- **Type tab** — type a passage with live WPM / accuracy / errors / time.
  Three sources via chips:
  - **Sample** — 10 built-in public-domain passages (dropdown + "New random").
  - **My text** — paste any text, hit Load.
  - **From URL** — fetches readable text via `r.jina.ai` reader proxy
    (CORS-enabled), with an `allorigins.win` + DOMParser fallback. Fetched text
    is editable before loading. Markdown/HTML is stripped and truncated to
    ~2500 chars at a sentence boundary.
- **Calibrate tab** — a short fixed passage; on completion offers "Save as my
  WPM".
- **Stats tab** — editable saved WPM + history of sessions (date, wpm,
  accuracy, time, source tag). Clear-history button.
- **ETA** — on the Type tab, shows estimated completion time of the current
  passage based on the saved WPM. Updates when WPM changes.
- **Sync** — optional GitHub Gist sync (username + token, Push/Pull) for WPM
  + history across devices. Same UX as mood_tracker.
- **PWA** — manifest, service worker, icon, installable to home screen,
  offline support (URL fetches and GitHub API never cached).

### WPM formula
`Net WPM = (chars typed / 5) / minutes − uncorrected errors`. Standard 5-char
word definition. Backspace corrects mistakes (reduces uncorrected count).

### Files
- `index.html` — UI / views
- `style.css` — dark theme + typing styles
- `text.js` — sample passages, URL fetch + cleaning, truncate
- `sync.js` — GitHub Gist sync (payload: wpm, wpmSetAt, history, savedTexts)
- `app.js` — typing engine, views, storage, stats, sync wiring
- `manifest.json` / `sw.js` / `icon.svg` — PWA
- `README.md` — user + dev docs
- `netlify.toml` / `.gitignore`

## Known issues / TODO
- Newline rendering in passages: a `\n` is a zero-height block span; while
  typing *through* a newline the current cursor is shown as a faint highlighted
  bar (`.nl.current`). Double newlines collapse to a single break (acceptable).
- URL fetch depends on third-party proxies (r.jina.ai, allorigins.win). If both
  are down, URL source fails gracefully with an error message; Sample/My text
  still work.
- `savedTexts` field is plumbed through sync but not yet exposed in the UI
  (placeholder for a future "saved texts" library).
- History is capped at 200 sessions locally; Stats shows the latest 50.

## How to run locally
```
python -m http.server 8000 --directory C:\Users\rudol\CascadeProjects\WritingApp
```
Open http://localhost:8000

## How to deploy (GitHub Pages)
1. Create repo `TypingApp` on GitHub (already done: https://github.com/RHauslers/TypingApp).
2. Push all files to `main`.
3. Settings → Pages → Source: `main` / root → Save.
4. Live at `https://rhauslers.github.io/TypingApp/`.

## How to fix common issues
- **Typing doesn't start:** click the passage once (it needs focus). The app
  auto-focuses on load and on tab switch.
- **Wrong characters not counted / WPM looks off:** make sure you're not
  typing in another input; the engine only counts keys while the passage has
  focus.
- **Service worker stale after changes:** bump `CACHE` in `sw.js` and
  hard-reload. The `netlify.toml` already sends `no-cache` for `sw.js`.
- **URL fetch fails:** try another URL; some pages block proxies or have no
  readable prose. Paste the text manually via "My text" instead.
