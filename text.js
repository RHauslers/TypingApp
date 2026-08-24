/* text.js — sample passages, URL fetching + cleaning. No external deps. */

const TextSource = (() => {
  // Public-domain passages of varying length. Each is plain prose.
  const SAMPLES = [
    "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!",

    "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.",

    "Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",

    "All happy families are alike; each unhappy family is unhappy in its own way. Everything was in confusion in the Oblonsky's house. The wife had discovered that the husband was carrying on an intrigue with a French girl, who had been a governess in their family.",

    "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.",

    "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.",

    "Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the galaxy lies a small unregarded yellow sun. Orbiting this at a distance of roughly ninety-two million miles is an utterly insignificant little blue green planet whose ape-descended life forms are so amazingly primitive that they still think digital watches are a pretty neat idea.",

    "The sky above the port was the color of television, tuned to a dead channel. Cyberspace. A consensual hallucination experienced daily by billions of legitimate operators, in every nation, by children being taught mathematical concepts.",

    "Once upon a midnight dreary, while I pondered, weak and weary, over many a quaint and curious volume of forgotten lore, while I nodded, nearly napping, suddenly there came a tapping, as of some one gently rapping, rapping at my chamber door.",

    "If you want to build a ship, do not drum up the men to gather wood, give orders and divide the work. Instead, teach them to yearn for the vast and endless sea. The sea, once it casts its spell, holds one in its net of wonder forever."
  ];

  // A short, fixed passage used by the Calibrate tab.
  const CALIBRATE_PASSAGE =
    "The quick brown fox jumps over the lazy dog while a curious cat watches from the garden wall. Five dozen liquor jugs packed carefully in a wooden box arrived just before the autumn rain began to fall.";

  function randomSample(exclude) {
    if (SAMPLES.length === 1) return SAMPLES[0];
    let s;
    do { s = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]; }
    while (s === exclude);
    return s;
  }

  function getSampleByIndex(i) {
    return SAMPLES[((i % SAMPLES.length) + SAMPLES.length) % SAMPLES.length];
  }

  function sampleCount() { return SAMPLES.length; }

  /* ---------------- URL fetching + cleaning ---------------- */

  // Strip markdown / HTML artefacts down to readable prose.
  function cleanExtracted(raw) {
    if (!raw) return "";
    let t = String(raw);
    // Drop image markdown ![alt](url)
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
    // Links [text](url) -> text
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    // Code fences ```...```
    t = t.replace(/```[\s\S]*?```/g, " ");
    // Inline code `...`
    t = t.replace(/`([^`]*)`/g, "$1");
    // Headings: leading # markers
    t = t.replace(/^[#>\-\*\+\s]+/gm, " ");
    // Bold/italic markers
    t = t.replace(/[*_~]+/g, "");
    // Horizontal rules
    t = t.replace(/^\s*[-*_]{3,}\s*$/gm, " ");
    // URLs left over
    t = t.replace(/https?:\/\/\S+/g, " ");
    // Collapse whitespace within lines
    t = t.replace(/[ \t]+/g, " ");
    // Trim each line
    t = t.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    // Collapse 3+ newlines to a paragraph break
    t = t.replace(/\n{2,}/g, "\n\n");
    return t.trim();
  }

  // Truncate to a max char count, ending at a sentence / paragraph boundary.
  function truncateForTyping(text, max = 2500) {
    if (text.length <= max) return text;
    const chunk = text.slice(0, max);
    // Try to end at the last sentence boundary
    const m = chunk.match(/(.+?[.!?])\s+/g);
    if (m) {
      let acc = "";
      for (const piece of m) {
        if ((acc + piece).length > max - 20) break;
        acc += piece;
      }
      if (acc.length > 40) return acc.trim();
    }
    // Fall back to last newline, else hard cut
    const nl = chunk.lastIndexOf("\n");
    if (nl > max * 0.5) return chunk.slice(0, nl).trim();
    return chunk.trim();
  }

  // Fetch readable text from a URL via the r.jina.ai reader proxy (CORS-enabled).
  // Falls back to allorigins + DOMParser if jina fails.
  async function fetchFromUrl(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter a full URL starting with http(s)://");

    // Primary: r.jina.ai reader (returns clean markdown-ish text)
    try {
      const res = await fetch("https://r.jina.ai/" + url, { headers: { "Accept": "text/plain" } });
      if (res.ok) {
        const raw = await res.text();
        const cleaned = cleanExtracted(raw);
        if (cleaned && cleaned.length > 40) return truncateForTyping(cleaned);
      }
    } catch (_) { /* try fallback */ }

    // Fallback: allorigins raw + DOMParser
    const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(url));
    if (!res.ok) throw new Error("Could not fetch that page (HTTP " + res.status + ")");
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Remove obviously non-prose nodes
    doc.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,iframe,svg,template").forEach((n) => n.remove());
    // Prefer <article> or <main>, else body
    const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
    const text = (root ? root.textContent : doc.body.textContent) || "";
    const cleaned = cleanExtracted(text);
    if (!cleaned) throw new Error("No readable text found on that page.");
    return truncateForTyping(cleaned);
  }

  return {
    SAMPLES,
    CALIBRATE_PASSAGE,
    randomSample,
    getSampleByIndex,
    sampleCount,
    fetchFromUrl,
    cleanExtracted,
    truncateForTyping
  };
})();
