/* sync.js — optional cloud sync via GitHub Gist API.
   Requires a GitHub Personal Access Token with 'gist' scope.
   Token + Gist ID stored in localStorage only.

   Synced payload: { wpm: number, wpmSetAt: iso, history: Session[], savedTexts: string[] }
   Session = { ts, wpm, accuracy, source, length } */

const Sync = (() => {
  const USERKEY  = "writing_sync_username";
  const TOKENKEY = "writing_sync_token";
  const GISTKEY  = "writing_sync_gist_id";
  const LASTKEY  = "writing_sync_last";
  function filename(username) { return "writing_" + username.toLowerCase().trim().replace(/[^a-z0-9]/g, "_") + ".json"; }
  const API = "https://api.github.com";

  function getUsername()  { return localStorage.getItem(USERKEY)  || ""; }
  function getToken()     { return localStorage.getItem(TOKENKEY) || ""; }
  function getGistId(u)   { return localStorage.getItem(GISTKEY + "_" + u.toLowerCase().trim()) || ""; }
  function saveUsername(u){ localStorage.setItem(USERKEY, u.trim()); }
  function saveToken(t)   { localStorage.setItem(TOKENKEY, t.trim()); }
  function saveGistId(u, id) { localStorage.setItem(GISTKEY + "_" + u.toLowerCase().trim(), id); }
  function getLastSync()  { return localStorage.getItem(LASTKEY) || null; }
  function setLastSync(a) { localStorage.setItem(LASTKEY, a + " at " + new Date().toLocaleTimeString()); }

  function headers(token) {
    return {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    };
  }

  // Merge histories by timestamp (ts); keep most recent entry per ts.
  function mergePayloads(local, remote) {
    const lh = Array.isArray(local?.history) ? local.history : [];
    const rh = Array.isArray(remote?.history) ? remote.history : [];
    const map = new Map();
    for (const e of [...lh, ...rh]) {
      const key = String(e.ts);
      const ex = map.get(key);
      if (!ex || (e.ts || 0) > (ex.ts || 0)) map.set(key, e);
    }
    const history = Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    // Newest WPM wins (latest wpmSetAt)
    const lAt = local?.wpmSetAt ? Date.parse(local.wpmSetAt) : 0;
    const rAt = remote?.wpmSetAt ? Date.parse(remote.wpmSetAt) : 0;
    const wpm = lAt >= rAt ? (local?.wpm || remote?.wpm || 0) : (remote?.wpm || local?.wpm || 0);
    const wpmSetAt = lAt >= rAt ? (local?.wpmSetAt || remote?.wpmSetAt) : (remote?.wpmSetAt || local?.wpmSetAt);
    // Union of saved texts, capped
    const savedTexts = Array.from(new Set([...(local?.savedTexts || []), ...(remote?.savedTexts || [])])).slice(0, 50);
    return { wpm: wpm || 0, wpmSetAt: wpmSetAt || null, history, savedTexts };
  }

  async function getOrCreateGist(token, username) {
    const fn = filename(username);
    const stored = getGistId(username);
    if (stored) return stored;

    const listRes = await fetch(`${API}/gists`, { headers: headers(token) });
    if (!listRes.ok) throw new Error("Token invalid or no gist access (" + listRes.status + ")");
    const gists = await listRes.json();
    const existing = gists.find((g) => g.files && g.files[fn]);
    if (existing) { saveGistId(username, existing.id); return existing.id; }

    const createRes = await fetch(`${API}/gists`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        description: "Writing Practice data for " + username,
        public: false,
        files: { [fn]: { content: JSON.stringify({ wpm: 0, wpmSetAt: null, history: [], savedTexts: [] }) } }
      })
    });
    if (!createRes.ok) throw new Error("Could not create gist (" + createRes.status + ")");
    const created = await createRes.json();
    saveGistId(username, created.id);
    return created.id;
  }

  async function push(token, username, payload) {
    const fn = filename(username);
    const gistId = await getOrCreateGist(token, username);
    const res = await fetch(`${API}/gists/${gistId}`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({ files: { [fn]: { content: JSON.stringify(payload) } } })
    });
    if (!res.ok) throw new Error("Push failed (" + res.status + ")");
    setLastSync("Pushed");
  }

  async function pull(token, username, localPayload) {
    const fn = filename(username);
    const gistId = await getOrCreateGist(token, username);
    const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
    if (!res.ok) throw new Error("Pull failed (" + res.status + ")");
    const gist = await res.json();
    const raw = gist.files?.[fn]?.content || "{}";
    let remote;
    try { remote = JSON.parse(raw); } catch { remote = {}; }
    const merged = mergePayloads(localPayload, remote);
    setLastSync("Pulled");
    return merged;
  }

  return { getUsername, getToken, getGistId, saveUsername, saveToken, saveGistId, getLastSync, push, pull, mergePayloads };
})();
