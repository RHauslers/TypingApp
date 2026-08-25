/* app.js — typing engine, views, storage, stats, sync wiring. */

(() => {
  "use strict";

  /* ----------------------- storage keys ----------------------- */
  const K_WPM   = "writing_wpm";        // saved user WPM (number)
  const K_WPMD  = "writing_wpm_date";   // ISO when saved
  const K_HIST  = "writing_history";    // Session[]
  const K_LAST_SAMPLE = "writing_last_sample"; // index
  const MAX_HIST = 200;

  /* ----------------------- helpers ----------------------- */
  const $  = (id) => document.getElementById(id);
  const fmtTime = (s) => (s < 60 ? s.toFixed(1) + "s" : Math.floor(s / 60) + "m " + Math.round(s % 60) + "s");
  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function getWpm() { return parseInt(localStorage.getItem(K_WPM) || "0", 10) || 0; }
  function setWpm(w, dateIso) {
    const n = Math.max(1, Math.min(400, Math.round(w)));
    localStorage.setItem(K_WPM, String(n));
    localStorage.setItem(K_WPMD, dateIso || new Date().toISOString());
  }
  function getHistory() { return loadJSON(K_HIST, []); }
  function addSession(s) {
    const h = getHistory();
    h.push(s);
    if (h.length > MAX_HIST) h.splice(0, h.length - MAX_HIST);
    saveJSON(K_HIST, h);
  }
  function clearHistory() { saveJSON(K_HIST, []); }

  function buildPayload() {
    return {
      wpm: getWpm(),
      wpmSetAt: localStorage.getItem(K_WPMD) || null,
      history: getHistory(),
      savedTexts: []
    };
  }

  function applyPayload(p) {
    if (p && typeof p.wpm === "number" && p.wpm > 0) {
      localStorage.setItem(K_WPM, String(p.wpm));
      if (p.wpmSetAt) localStorage.setItem(K_WPMD, p.wpmSetAt);
    }
    if (Array.isArray(p?.history)) saveJSON(K_HIST, p.history);
  }

  function sourceLabel(s) {
    return ({ sample: "Sample", custom: "My text", url: "URL", calibrate: "Calibrate" })[s] || s;
  }

  /* ----------------------- typing engine ----------------------- */
  // statMap: { wpm?, acc?, err?, time? } — element ids
  // opts: { onComplete(result), liveUpdate(true) }
  function createSession(passageEl, statMap, opts = {}) {
    let text = "", chars = [], status = [];
    let pos = 0, errors = 0, startTime = null, finished = false, frozen = false, timer = null;

    function setStatusClasses(i) {
      const span = chars[i];
      if (!span) return;
      const c = text[i];
      span.classList.remove("pending", "correct", "wrong", "current");
      const st = status[i];
      span.classList.add(st);
      if (c === "\n") span.classList.add("nl");
      if (c === " " && st === "correct") span.classList.add("space");
      if (i === pos && !finished) span.classList.add("current");
    }

    function render() {
      passageEl.innerHTML = "";
      chars = [];
      status = new Array(text.length).fill("pending");
      const frag = document.createDocumentFragment();
      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span");
        span.className = "ch pending";
        const c = text[i];
        if (c === "\n") { span.classList.add("nl"); span.textContent = "\n"; }
        else { span.textContent = c; }
        frag.appendChild(span);
        chars.push(span);
      }
      passageEl.appendChild(frag);
      if (chars.length) chars[0].classList.add("current");
    }

    function correctChars() { let n = 0; for (const s of status) if (s === "correct") n++; return n; }
    function uncorrected() { let n = 0; for (const s of status) if (s === "wrong") n++; return n; }

    // Safely set text on an element by id (no-op if the element doesn't exist).
    function setText(id, val) {
      const el = id && $(id);
      if (el) el.textContent = val;
    }

    function updateStats() {
      if (frozen) return; // stats locked after completion — never drift
      const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
      const corr = correctChars();
      const typed = pos;
      const gross = elapsed > 0 ? (typed / 5) / (elapsed / 60) : 0;
      const net = Math.max(0, gross - uncorrected());
      const acc = typed > 0 ? (corr / typed) * 100 : 100;
      setText(statMap.wpm, Math.round(net));
      setText(statMap.acc, acc.toFixed(0) + "%");
      setText(statMap.err, String(errors));
      setText(statMap.time, fmtTime(elapsed));
    }

    // Scroll the current character into view (only when out of view) so long
    // passages auto-follow as you type. Uses block:"nearest" to avoid jumping.
    function scrollCurrentIntoView() {
      const cur = chars[pos] || chars[pos - 1];
      if (cur && cur.scrollIntoView) {
        cur.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    function finish() {
      if (finished) return;
      finished = true;
      frozen = true; // lock the stat display at the final values
      clearInterval(timer);
      timer = null;
      // remove current marker
      if (chars[pos]) chars[pos].classList.remove("current");
      const elapsed = (Date.now() - startTime) / 1000;
      const corr = correctChars();
      const typed = pos;
      const gross = elapsed > 0 ? (typed / 5) / (elapsed / 60) : 0;
      const uncorr = uncorrected();
      const net = Math.max(0, gross - uncorr);
      const acc = typed > 0 ? (corr / typed) * 100 : 100;
      // Write the frozen final values directly (updateStats is now a no-op).
      setText(statMap.wpm, Math.round(net));
      setText(statMap.acc, acc.toFixed(0) + "%");
      setText(statMap.err, String(errors));
      setText(statMap.time, fmtTime(elapsed));
      if (opts.onComplete) opts.onComplete({
        wpm: Math.round(net),
        grossWpm: Math.round(gross),
        accuracy: acc,
        errors,
        uncorrected: uncorr,
        seconds: elapsed,
        length: text.length,
        correctChars: corr
      });
    }

    function onKey(e) {
      if (finished) return;
      // Only handle when the passage (or a descendant) has focus
      if (!passageEl.contains(document.activeElement) && document.activeElement !== passageEl) return;

      const key = e.key;

      // Ignore pure modifier / non-character keys
      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" ||
          key === "CapsLock" || key === "Tab" || key === "Escape" ||
          key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" ||
          key === "Home" || key === "End" || key === "PageUp" || key === "PageDown") {
        return;
      }

      if (key === "Backspace") {
        e.preventDefault();
        if (pos > 0) {
          pos--;
          status[pos] = "pending";
          setStatusClasses(pos);
          if (pos + 1 < chars.length) setStatusClasses(pos + 1);
        }
        updateStats();
        scrollCurrentIntoView();
        return;
      }

      // A printable char or Enter (for newline targets)
      if (key.length === 1 || key === "Enter") {
        e.preventDefault();
        if (pos >= text.length) return;
        if (!startTime) {
          startTime = Date.now();
          if (opts.liveUpdate !== false) {
            timer = setInterval(updateStats, 150);
          }
        }
        const target = text[pos];
        const typedChar = key === "Enter" ? "\n" : key;
        // Newline target accepts Enter or Space (friendlier); else must match exactly
        const ok = (target === "\n") ? (key === "Enter" || key === " ") : (typedChar === target);
        if (ok) {
          status[pos] = "correct";
        } else {
          status[pos] = "wrong";
          errors++;
        }
        const justTyped = pos;
        pos++;
        setStatusClasses(justTyped);
        if (pos < chars.length) setStatusClasses(pos);
        updateStats();
        scrollCurrentIntoView();
        if (pos >= text.length) finish();
        return;
      }
    }

    function load(t) {
      // Normalise: trim trailing whitespace, collapse \r\n -> \n
      text = String(t || "").replace(/\r\n?/g, "\n").replace(/\s+$/g, "");
      pos = 0; errors = 0; startTime = null; finished = false; frozen = false;
      clearInterval(timer); timer = null;
      render();
      updateStats();
    }

    function focus() { passageEl.focus(); }
    function isFinished() { return finished; }
    function destroy() { clearInterval(timer); document.removeEventListener("keydown", onKey, true); }

    // Capture-phase listener so we can preventDefault before other handlers
    document.addEventListener("keydown", onKey, true);
    passageEl.addEventListener("click", focus);

    return { load, focus, isFinished, destroy, getPos: () => pos, getText: () => text };
  }

  /* ----------------------- view switching ----------------------- */
  function switchView(viewId) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-view") === viewId));
    window.scrollTo(0, 0);
  }

  /* ----------------------- ETA ----------------------- */
  function computeEta(text, wpm) {
    if (!wpm || wpm <= 0) return null;
    const chars = String(text || "").length;
    if (chars <= 0) return null;
    const minutes = chars / 5 / wpm;
    return minutes * 60; // seconds
  }
  function fmtEta(sec) {
    if (sec == null) return "—";
    if (sec < 60) return Math.round(sec) + "s";
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + "m " + s + "s";
  }

  /* ----------------------- DOM refs ----------------------- */
  const passageEl = $("passage");
  const calPassageEl = $("cal-passage");
  const resultCard = $("result-card");
  const calResult = $("cal-result");
  const prevChunkBtn = $("btn-prev-chunk");
  const nextChunkBtn = $("btn-next-chunk");

  /* ----------------------- main typing session (chunked) ----------------------- */
  let fullText = "";        // the entire loaded article
  let currentSource = "sample";
  let chunks = [];          // array of chunk strings
  let chunkIndex = 0;
  let chunkSize = 1500;     // 0 => whole text as one chunk

  let mainSession = createSession(passageEl, {
    wpm: "stat-wpm", acc: "stat-acc", err: "stat-err", time: "stat-time"
  }, {
    onComplete: (r) => onMainComplete(r)
  });

  function rechunk() {
    chunks = chunkSize > 0 ? TextSource.chunkText(fullText, chunkSize) : [fullText];
    if (chunks.length === 0) chunks = [fullText];
  }

  // Load a whole article (sample / custom / url) and start at chunk 0.
  function loadArticle(text, source) {
    fullText = String(text || "");
    currentSource = source;
    rechunk();
    chunkIndex = 0;
    loadChunk(chunkIndex);
  }

  function loadChunk(i) {
    chunkIndex = Math.max(0, Math.min(chunks.length - 1, i));
    mainSession.load(chunks[chunkIndex]);
    resultCard.classList.add("hidden");
    resultCard.innerHTML = "";
    $("type-hint").classList.remove("hidden");
    updateChunkUi();
    setTimeout(() => passageEl.focus(), 0);
  }

  function updateChunkUi() {
    prevChunkBtn.disabled = chunkIndex <= 0;
    nextChunkBtn.disabled = chunkIndex >= chunks.length - 1;
    updateWidget();
  }

  /* ---- top-right WPM widget (pinned): WPM + chunk size + position + ETA ---- */
  const widgetWpm = $("widget-wpm");
  const widgetOk = $("widget-ok");
  const widgetEta = $("widget-eta");
  const widgetChunkPos = $("widget-chunk-pos");
  const widgetChunkSize = $("widget-chunk-size");

  function updateWidget() {
    const w = getWpm();
    const curText = chunks[chunkIndex] || "";
    // Chunk position — shown only when there's more than one chunk
    if (chunks.length > 1) {
      widgetChunkPos.textContent = (chunkIndex + 1) + "/" + chunks.length;
      widgetChunkPos.classList.remove("hidden");
    } else {
      widgetChunkPos.classList.add("hidden");
    }
    // ETA line — only when both WPM and a current text are set
    if (w > 0 && curText.length > 0) {
      const sec = computeEta(curText, w);
      const total = computeEta(fullText, w);
      const more = chunks.length > 1
        ? " · whole: " + fmtEta(total)
        : "";
      widgetEta.innerHTML = "Est: <b>" + fmtEta(sec) + "</b>" + more;
      widgetEta.classList.remove("hidden");
    } else {
      widgetEta.classList.add("hidden");
    }
  }

  function applyWidgetWpm() {
    const v = parseInt(widgetWpm.value, 10);
    if (!v || v < 1 || v > 400) {
      widgetWpm.value = getWpm() > 0 ? String(getWpm()) : "";
      return;
    }
    setWpm(v);
    renderWpmBox();
    updateChunkUi();
    widgetOk.textContent = "✓";
    setTimeout(() => (widgetOk.textContent = "OK"), 900);
  }
  widgetOk.addEventListener("click", applyWidgetWpm);
  // Handle Enter to save, and stop the key from reaching the passage engine.
  widgetWpm.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); applyWidgetWpm(); }
  });
  // Chunk-size change in the widget
  widgetChunkSize.addEventListener("change", (e) => {
    e.stopPropagation();
    chunkSize = parseInt(e.target.value, 10);
    localStorage.setItem("writing_chunk_size", String(chunkSize));
    rechunk();
    loadChunk(0);
  });
  // Don't let widget clicks/keys reach the passage
  widgetChunkSize.addEventListener("keydown", (e) => e.stopPropagation(), true);

  function onMainComplete(r) {
    $("type-hint").classList.add("hidden");
    const session = {
      ts: Date.now(),
      wpm: r.wpm,
      accuracy: Math.round(r.accuracy),
      source: currentSource,
      length: r.length,
      seconds: Math.round(r.seconds)
    };
    addSession(session);
    const prevWpm = getWpm();
    const newBest = r.wpm > prevWpm;
    const isLast = chunkIndex >= chunks.length - 1;
    const hasNext = chunks.length > 1 && !isLast;

    const title = isLast
      ? (chunks.length > 1 ? "Article complete!" : "Done!")
      : "Chunk " + (chunkIndex + 1) + " of " + chunks.length + " done!";
    const nextBtn = hasNext
      ? `<button id="btn-result-next" class="primary-btn">Next chunk ›</button>`
      : "";
    const saveBtn = `<button id="btn-save-wpm-result" class="secondary-btn">
        ${newBest ? "Save as my WPM (new best!)" : "Save as my WPM"}
      </button>`;

    resultCard.classList.remove("hidden");
    resultCard.innerHTML = `
      <h3>${title}</h3>
      <div class="result-grid">
        <div class="result-kv"><div class="v">${r.wpm}</div><div class="k">Net WPM</div></div>
        <div class="result-kv"><div class="v">${r.accuracy.toFixed(0)}%</div><div class="k">Accuracy</div></div>
        <div class="result-kv"><div class="v">${fmtTime(r.seconds)}</div><div class="k">Time</div></div>
        <div class="result-kv"><div class="v">${r.uncorrected}</div><div class="k">Uncorrected</div></div>
      </div>
      <p class="muted">${r.correctChars} of ${r.length} characters correct. Gross WPM: ${r.grossWpm}.</p>
      ${nextBtn}
      <button id="btn-result-retry" class="secondary-btn">Retry this chunk</button>
      ${saveBtn}
    `;
    if (hasNext) {
      $("btn-result-next").addEventListener("click", () => loadChunk(chunkIndex + 1));
    }
    $("btn-save-wpm-result").addEventListener("click", () => {
      setWpm(r.wpm);
      renderWpmBox();
      updateChunkUi();
      renderHistory();
      $("btn-save-wpm-result").textContent = "Saved ✓";
      $("btn-save-wpm-result").disabled = true;
    });
    $("btn-result-retry").addEventListener("click", () => loadChunk(chunkIndex));
    renderHistory();
  }

  // Chunk navigation (chunk-size selector lives in the pinned widget)
  prevChunkBtn.addEventListener("click", () => { if (chunkIndex > 0) loadChunk(chunkIndex - 1); });
  nextChunkBtn.addEventListener("click", () => { if (chunkIndex < chunks.length - 1) loadChunk(chunkIndex + 1); });

  /* ----------------------- source chips ----------------------- */
  document.querySelectorAll(".source-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".source-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const src = chip.getAttribute("data-source");
      $("src-sample").classList.toggle("hidden", src !== "sample");
      $("src-custom").classList.toggle("hidden", src !== "custom");
      $("src-url").classList.toggle("hidden", src !== "url");
      if (src === "sample") loadRandomSample();
    });
  });

  /* ----------------------- sample source ----------------------- */
  function fillSampleSelect() {
    const sel = $("sample-select");
    sel.innerHTML = "";
    for (let i = 0; i < TextSource.sampleCount(); i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      const preview = TextSource.getSampleByIndex(i).slice(0, 48).replace(/\n/g, " ");
      opt.textContent = (i + 1) + ". " + preview + "…";
      sel.appendChild(opt);
    }
    sel.value = String(localStorage.getItem(K_LAST_SAMPLE) || 0);
  }
  function loadRandomSample() {
    const idx = Math.floor(Math.random() * TextSource.sampleCount());
    localStorage.setItem(K_LAST_SAMPLE, String(idx));
    $("sample-select").value = String(idx);
    loadArticle(TextSource.getSampleByIndex(idx), "sample");
  }
  $("sample-select").addEventListener("change", (e) => {
    const idx = parseInt(e.target.value, 10);
    localStorage.setItem(K_LAST_SAMPLE, String(idx));
    loadArticle(TextSource.getSampleByIndex(idx), "sample");
  });
  $("btn-new-sample").addEventListener("click", loadRandomSample);

  /* ----------------------- custom source ----------------------- */
  $("btn-load-custom").addEventListener("click", () => {
    const t = $("custom-text").value.trim();
    if (t.length < 5) { alert("Paste a bit more text to type (at least a few words)."); return; }
    loadArticle(t, "custom");
  });

  /* ----------------------- url source ----------------------- */
  $("btn-fetch-url").addEventListener("click", async () => {
    const url = $("url-input").value.trim();
    const statusEl = $("url-status");
    const ta = $("url-text");
    const loadBtn = $("btn-load-url");
    if (!url) return;
    statusEl.textContent = "Fetching…";
    $("btn-fetch-url").disabled = true;
    try {
      const text = await TextSource.fetchFromUrl(url);
      ta.value = text;
      ta.classList.remove("hidden");
      loadBtn.classList.remove("hidden");
      statusEl.textContent = "Fetched " + text.length + " chars. Edit if you like, then Load.";
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
      ta.classList.add("hidden");
      loadBtn.classList.add("hidden");
    } finally {
      $("btn-fetch-url").disabled = false;
    }
  });
  $("btn-load-url").addEventListener("click", () => {
    const t = $("url-text").value.trim();
    if (t.length < 5) { alert("No text to load."); return; }
    loadArticle(t, "url");
  });

  /* ----------------------- calibrate ----------------------- */
  let calSession = createSession(calPassageEl, {
    wpm: "cal-wpm", acc: "cal-acc", err: "cal-err", time: "cal-time"
  }, {
    onComplete: (r) => onCalComplete(r)
  });

  function loadCalibrate() {
    calSession.load(TextSource.CALIBRATE_PASSAGE);
    calResult.classList.add("hidden");
    calResult.innerHTML = "";
    $("cal-hint").classList.remove("hidden");
    setTimeout(() => calPassageEl.focus(), 0);
  }

  function onCalComplete(r) {
    $("cal-hint").classList.add("hidden");
    addSession({
      ts: Date.now(),
      wpm: r.wpm,
      accuracy: Math.round(r.accuracy),
      source: "calibrate",
      length: r.length,
      seconds: Math.round(r.seconds)
    });
    calResult.classList.remove("hidden");
    calResult.innerHTML = `
      <h3>Your WPM: ${r.wpm}</h3>
      <div class="result-grid">
        <div class="result-kv"><div class="v">${r.wpm}</div><div class="k">Net WPM</div></div>
        <div class="result-kv"><div class="v">${r.accuracy.toFixed(0)}%</div><div class="k">Accuracy</div></div>
        <div class="result-kv"><div class="v">${fmtTime(r.seconds)}</div><div class="k">Time</div></div>
        <div class="result-kv"><div class="v">${r.uncorrected}</div><div class="k">Uncorrected</div></div>
      </div>
      <p class="muted">This will be used to estimate completion times on the Type tab.</p>
      <button id="btn-cal-save" class="primary-btn">Save as my WPM</button>
    `;
    $("btn-cal-save").addEventListener("click", () => {
      setWpm(r.wpm);
      renderWpmBox();
      updateChunkUi();
      renderHistory();
      $("btn-cal-save").textContent = "Saved ✓";
      $("btn-cal-save").disabled = true;
    });
    renderHistory();
  }

  $("btn-cal-retry").addEventListener("click", loadCalibrate);

  /* ----------------------- stats view ----------------------- */
  function renderWpmBox() {
    const w = getWpm();
    $("wpm-input").value = w > 0 ? String(w) : "";
    widgetWpm.value = w > 0 ? String(w) : "";
    const d = localStorage.getItem(K_WPMD);
    if (w > 0) {
      const when = d ? new Date(d).toLocaleDateString() : "—";
      $("wpm-source").textContent = "Saved WPM: " + w + " (set " + when + ")";
    } else {
      $("wpm-source").textContent = "No WPM set yet — run Calibrate or type one in.";
    }
  }
  $("btn-save-wpm").addEventListener("click", () => {
    const v = parseInt($("wpm-input").value, 10);
    if (!v || v < 1 || v > 400) { alert("Enter a WPM between 1 and 400."); return; }
    setWpm(v);
    renderWpmBox();
    updateChunkUi();
    $("btn-save-wpm").textContent = "Saved ✓";
    setTimeout(() => ($("btn-save-wpm").textContent = "Save"), 1200);
  });

  function renderHistory() {
    const list = $("history-list");
    const h = getHistory().slice().reverse();
    $("hist-count").textContent = h.length ? String(h.length) : "";
    if (h.length === 0) {
      list.innerHTML = '<div class="empty">No sessions yet. Type a passage to see your history here.</div>';
      return;
    }
    list.innerHTML = "";
    for (const s of h.slice(0, 50)) {
      const row = document.createElement("div");
      row.className = "session";
      const when = new Date(s.ts).toLocaleString();
      const tagClass = s.source === "calibrate" ? "cal" : (s.source === "url" ? "url" : (s.source === "custom" ? "custom" : ""));
      row.innerHTML = `
        <div class="wpm-big">${s.wpm}</div>
        <div class="info">
          <div class="when">${when}</div>
          <div class="meta">${s.accuracy}% accuracy · ${fmtTime(s.seconds)} · ${s.length} chars</div>
        </div>
        <span class="tag ${tagClass}">${sourceLabel(s.source)}</span>
      `;
      list.appendChild(row);
    }
  }
  $("btn-clear-history").addEventListener("click", () => {
    if (confirm("Delete all saved sessions? This cannot be undone.")) {
      clearHistory();
      renderHistory();
    }
  });

  /* ----------------------- tabs ----------------------- */
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const v = tab.getAttribute("data-view");
      switchView(v);
      if (v === "view-stats") { renderWpmBox(); renderHistory(); }
      if (v === "view-calibrate" && !calSession.isFinished() && calSession.getPos() === 0) {
        setTimeout(() => calPassageEl.focus(), 0);
      }
      if (v === "view-type") setTimeout(() => passageEl.focus(), 0);
    });
  });

  /* ----------------------- sync wiring ----------------------- */
  function renderSync() {
    const u = Sync.getUsername();
    const t = Sync.getToken();
    $("sync-username").value = u;
    $("sync-token").value = t;
    const last = Sync.getLastSync();
    $("sync-status").textContent = last ? "Last: " + last : (u ? "Ready to push/pull." : "");
  }
  $("btn-save-user").addEventListener("click", () => {
    Sync.saveUsername($("sync-username").value);
    Sync.saveToken($("sync-token").value.trim());
    $("sync-username").classList.add("saved");
    $("sync-token").classList.add("saved");
    renderSync();
  });
  $("btn-push").addEventListener("click", async () => {
    const token = Sync.getToken(), user = Sync.getUsername();
    if (!token || !user) { $("sync-status").textContent = "Set username + token first."; return; }
    $("sync-status").textContent = "Pushing…";
    try {
      await Sync.push(token, user, buildPayload());
      renderSync();
    } catch (e) { $("sync-status").textContent = "Push failed: " + e.message; }
  });
  $("btn-pull").addEventListener("click", async () => {
    const token = Sync.getToken(), user = Sync.getUsername();
    if (!token || !user) { $("sync-status").textContent = "Set username + token first."; return; }
    $("sync-status").textContent = "Pulling…";
    try {
      const merged = await Sync.pull(token, user, buildPayload());
      applyPayload(merged);
      renderSync();
      renderWpmBox();
      renderHistory();
      updateChunkUi();
    } catch (e) { $("sync-status").textContent = "Pull failed: " + e.message; }
  });

  /* ----------------------- service worker ----------------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ----------------------- init ----------------------- */
  const savedSize = parseInt(localStorage.getItem("writing_chunk_size") || "1500", 10);
  chunkSize = isNaN(savedSize) ? 1500 : savedSize;
  widgetChunkSize.value = String(chunkSize);
  fillSampleSelect();
  loadRandomSample();
  loadCalibrate();
  renderWpmBox();
  renderHistory();
  renderSync();
  updateChunkUi();
  // Auto-focus the main passage once on load
  setTimeout(() => passageEl.focus(), 100);
})();
