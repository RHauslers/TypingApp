# Writing Practice

A typing-practice web app inspired by the Human Benchmark **Typing / Writing**
test, with a few extras that make it better for actually *learning*:

- **Type a sample passage** — classic public-domain texts, ready to go.
- **Paste your own text** — practice with anything you're reading or writing.
- **Fetch from a URL** — drop in an article link and the app pulls clean text
  so you can type it. Great for absorbing a text while you learn to type it.
- **Calibrate your WPM** — a short fixed test measures your typing speed and
  saves it. (You can also type your WPM in manually.)
- **Completion-time estimate** — once the app knows your WPM, it tells you how
  long the current passage will take you before you even start.

Everything runs in the browser. It's an installable PWA, so you can add it to
your phone's home screen and use it offline, just like the Mood & Weather
tracker.

## 📱 Get it on your phone (takes 1 minute)

1. On your phone, open this link in **Chrome** (Android) or **Safari** (iPhone):

   ### 👉 https://rhauslers.github.io/TypingApp/

2. Tap the browser menu (**⋮** in Chrome, the **Share** icon in Safari) →
   **"Add to Home screen"** → **Add**.
3. Done — there's now an app icon on your home screen. Open it like any app.

## 🖥️ Use it on a computer

Open the same link in any browser and bookmark it.

## How to use it

- **Type tab** — pick a source (Sample / My text / From URL) and start typing.
  Live stats show WPM, accuracy, errors, time, and ETA based on your saved WPM.
  When you finish, the result card offers to save the run as your new WPM.
- **Calibrate tab** — a short, fixed passage. Type it once and the app sets
  your WPM automatically. Re-run it any time you want to re-measure.
- **Stats tab** — your saved WPM (editable), and a history of past runs.
  Optionally sync across devices with a GitHub token (see in-app guide).

## Your privacy

Everything stays on **your device** (localStorage). URL fetching goes through
the free [r.jina.ai](https://r.jina.ai) reader proxy; no data is sent anywhere
else. Optional cloud sync uses your own private GitHub Gist — only you can see
it. If you clear your browser data, your stats are deleted too.

---

## For developers

### Run locally
```
python -m http.server 8000
```
Open http://localhost:8000

### WPM calculation
Standard formula: `WPM = (characters typed / 5) / minutes`. Spaces count as
characters. Net WPM subtracts uncorrected errors.

### Files
- `index.html` / `style.css` — UI
- `text.js` — sample passages, URL fetching + text cleaning
- `sync.js` — optional GitHub Gist sync (WPM history + saved texts)
- `app.js` — typing engine, stats, views, storage
- `manifest.json` / `sw.js` / `icon.svg` — PWA install + offline support

### Deploy to GitHub Pages
1. Create a new repo named `TypingApp` on GitHub.
2. Push these files to the `main` branch.
3. Settings → Pages → Source: `main` / root → Save.
4. Your app is live at `https://<your-username>.github.io/TypingApp/`.
