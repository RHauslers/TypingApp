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

  // Find the index of the closing ')' for the '(' at position p, allowing
  // one level of nested parens (URLs like Type_(disambiguation) need this).
  function findParenClose(text, p) {
    if (text[p] !== "(") return -1;
    let depth = 0;
    for (let j = p; j < text.length; j++) {
      const c = text[j];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) return j; }
      else if (c === "\n") return -1; // links don't span lines
    }
    return -1;
  }

  // For a markdown link starting with '[' at position p, find the closing ']'
  // and the following '(...'. Returns { textStart, textEnd, end } or null.
  // textStart/textEnd bound the link text (exclusive of brackets); end is the
  // index just past the closing ')'.
  function parseLink(text, p) {
    if (text[p] !== "[") return null;
    let j = p + 1;
    // Link text does not contain a raw ']'.
    while (j < text.length && text[j] !== "]") j++;
    if (j >= text.length) return null;
    const textEnd = j;
    if (text[j + 1] !== "(") return null;
    const urlClose = findParenClose(text, j + 1);
    if (urlClose < 0) return null;
    return { textStart: p + 1, textEnd, end: urlClose + 1 };
  }

  // Replace markdown links/images with their text (or nothing for images).
  // Handles nested parens in URLs and nested [![alt](url)](url) image-links.
  function stripMarkdownLinks(text) {
    let out = "", i = 0;
    const n = text.length;
    while (i < n) {
      // Nested image-link: [![alt](url)](url)  -> remove entirely
      if (text[i] === "[" && text[i + 1] === "!") {
        // The inner image's '[' sits at i+2 (i='[', i+1='!', i+2='[').
        const img = parseLink(text, i + 2);
        if (img) {
          // After the inner image we expect '](url)' for the wrapping link.
          let end = img.end;
          if (text[end] === "]" && text[end + 1] === "(") {
            const wrap = findParenClose(text, end + 1);
            if (wrap >= 0) end = wrap + 1;
          }
          i = end;
          continue;
        }
      }
      // Image: ![alt](url) -> remove
      if (text[i] === "!" && text[i + 1] === "[") {
        const img = parseLink(text, i + 1);
        if (img) { i = img.end; continue; }
      }
      // Reference-style citation: [[N]](url) or [[N]] -> remove.
      // Only match a local [[identifier]] (no [ or ] inside) so we don't
      // accidentally scan forward and swallow text up to a distant ]].
      if (text[i] === "[" && text[i + 1] === "[") {
        const cm = /^\[\[[^\]\[]+\]\]/.exec(text.slice(i));
        if (cm) {
          let end = i + cm[0].length;
          if (text[end] === "(") {
            const pc = findParenClose(text, end);
            if (pc >= 0) end = pc + 1;
          }
          i = end;
          continue;
        }
      }
      // Plain link: [text](url) -> text
      if (text[i] === "[") {
        const link = parseLink(text, i);
        if (link) {
          out += text.slice(link.textStart, link.textEnd);
          i = link.end;
          // Insert a space between adjacent links / before a dash that follows
          // a link with no separating space (e.g. [physicist](url)[Stephen Hawking](url)
          // or [Muscle memory](url)– Consolidating...).
          const nx = text[i];
          if (out.length && !/\s$/.test(out) &&
              ((nx === "[" && text[i + 1] !== "[" && text[i + 1] !== "!") ||
               nx === "\u2013" || nx === "\u2014")) {
            out += " ";
          }
          continue;
        }
      }
      out += text[i];
      i++;
    }
    return out;
  }

  // Strip markdown / HTML artefacts down to readable prose.
  function cleanExtracted(raw) {
    if (!raw) return "";
    let t = String(raw);

    // 1. Drop the r.jina.ai reader header block (Title:/URL Source:/.../Markdown Content:)
    const mdIdx = t.indexOf("Markdown Content:");
    if (mdIdx >= 0 && mdIdx < 600) t = t.slice(mdIdx + "Markdown Content:".length);

    // 2. Cut everything from the references / notes / further-reading section onward.
    //    Matches a references heading OR a Wikipedia numbered citation entry.
    const cutMatch = t.match(
      /^(?:#{1,6}\s*(?:References|Notes|Citations|Bibliography|Sources|Further\s+reading|External\s+links)\s*$|\d+\.\s+\[[^\]]*\]\([^)]*cite_(?:ref|note))/m
    );
    if (cutMatch && cutMatch.index >= 0) t = t.slice(0, cutMatch.index);

    // 3. Drop image-only and video-only lines together with the caption line
    //    that follows them (Wikipedia pattern: image, blank, caption, blank).
    {
      const lines = t.split("\n");
      const kept = [];
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k].trim();
        const isImageOnly =
          /^\[?!\[[^\]]*\]\([^)]*\)(?:\]\([^)]*\))?\s*$/.test(line) ||
          /^!\[[^\]]*\]\([^)]*\)\s*$/.test(line);
        const isVideoOnly = /^\[Video\s*\d+\]\([^)]*\)\s*$/.test(line);
        if (isImageOnly || isVideoOnly) {
          // Skip the next non-empty line if it looks like a short caption.
          let nk = k + 1;
          while (nk < lines.length && lines[nk].trim() === "") nk++;
          if (nk < lines.length && lines[nk].trim().length < 140) k = nk;
          continue;
        }
        kept.push(lines[k]);
      }
      t = kept.join("\n");
    }

    // 4. Remove {{template}} artefacts (e.g. {{cite conference}})
    t = t.replace(/\{\{[^{}]*\}\}/g, " ");

    // (Section [edit] links like [[edit](url)] become "[edit]" after link
    //  stripping below; we remove those leftovers in step 9.)

    // 5. Remove Wikipedia editorial markers like [citation needed], [dubious]...
    //    Handle the common wrapper [_[citation needed](url)_] and bare [citation needed].
    t = t.replace(/\[?_?\[(?:citation needed|needs update|better source needed|clarification needed|dubious|dead link|failed verification|original research?)\]\([^)]*\)_?\]?/gi, " ");
    t = t.replace(/\[(?:citation needed|needs update|better source needed|clarification needed|dubious|dead link|failed verification|original research?)\]/gi, " ");

    // 4. Remove [edit] section-edit links: [[edit](url)] or [[edit](url "title")]
    t = t.replace(/\[\[edit\]\]\([^)]*\)\]/g, " ");

    // 6. Strip markdown links/images (handles nested parens + nested image-links)
    t = stripMarkdownLinks(t);

    // 7. Code fences and inline code
    t = t.replace(/```[\s\S]*?```/g, " ");
    t = t.replace(/`([^`]*)`/g, "$1");

    // 8. Standalone URLs that survived link stripping
    t = t.replace(/https?:\/\/\S+/g, " ");

    // 9. Reference arrows, [edit] section-link leftovers, and empty brackets
    t = t.replace(/↑/g, " ");
    t = t.replace(/\[edit\]/gi, " ");
    t = t.replace(/\[\s*\]/g, " ");

    // 10. Sister-project boxes (Wikiversity / Wikimedia Commons lines)
    t = t.replace(/^Wikiversity has learning resources about.*$/gm, "");
    t = t.replace(/^Media related to .* at Wikimedia Commons.*$/gm, "");

    // 11. Headings: drop the # markers but keep the heading text as its own
    //     paragraph (blank lines around it) so titles stay visually distinct.
    t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+)$/gm, "\n\n$1\n\n");

    // 12. Blockquote markers
    t = t.replace(/^[ \t]*>+[ \t]*/gm, "");

    // 13. List markers (bullet and numbered)
    t = t.replace(/^[ \t]*[-*+•][ \t]+/gm, "");
    t = t.replace(/^[ \t]*\d+\.[ \t]+/gm, "");

    // 14. Bold / italic / strike markers
    t = t.replace(/[*_~]+/g, "");

    // 15. Horizontal rules
    t = t.replace(/^\s*[-*_]{3,}\s*$/gm, " ");

    // 16. Collapse whitespace within lines, trim each line, drop empties.
    //     Also fix space-before-punctuation left by removing inline markers.
    t = t.replace(/[ \t]+/g, " ");
    t = t.replace(/ +([.,;:!?)])/g, "$1");
    t = t.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

    // 17. Collapse 3+ newlines to a single paragraph break
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  // Cap a very long article to a sane maximum so the textarea stays usable.
  // Cuts at a paragraph boundary near the limit.
  function capLength(text, max = 60000) {
    if (text.length <= max) return text;
    const cut = text.lastIndexOf("\n\n", max);
    return (cut > max * 0.5 ? text.slice(0, cut) : text.slice(0, max)).trim();
  }

  // Split a cleaned article into typing chunks, each ending at a sentence or
  // paragraph boundary near the target size. Returns string[].
  function chunkText(text, target = 1500) {
    if (!text) return [];
    if (text.length <= target) return [text];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      if (text.length - start <= target * 1.4) { chunks.push(text.slice(start).trim()); break; }
      const window = text.slice(start, start + target);
      // Prefer a paragraph break, then a sentence end, then a space.
      let brk = window.lastIndexOf("\n\n");
      if (brk < target * 0.4) {
        const sent = window.match(/.*[.!?]["'’”)]?\s/s);
        if (sent && sent[0].length > target * 0.4) brk = sent[0].length - 1;
      }
      if (brk < target * 0.4) brk = window.lastIndexOf(" ");
      if (brk <= 0) brk = target;
      chunks.push(text.slice(start, start + brk).trim());
      start += brk;
      while (text[start] === "\n" || text[start] === " ") start++;
    }
    return chunks.filter((c) => c.length > 0);
  }

  // Fetch readable text from a URL via the r.jina.ai reader proxy (CORS-enabled).
  // Falls back to allorigins + DOMParser if jina fails. Returns the FULL cleaned
  // text; chunking is handled by the caller.
  async function fetchFromUrl(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter a full URL starting with http(s)://");

    // Primary: r.jina.ai reader (returns clean markdown-ish text)
    try {
      const res = await fetch("https://r.jina.ai/" + url, { headers: { "Accept": "text/plain" } });
      if (res.ok) {
        const raw = await res.text();
        const cleaned = cleanExtracted(raw);
        if (cleaned && cleaned.length > 40) return capLength(cleaned);
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
    return capLength(cleaned);
  }

  return {
    SAMPLES,
    CALIBRATE_PASSAGE,
    randomSample,
    getSampleByIndex,
    sampleCount,
    fetchFromUrl,
    cleanExtracted,
    capLength,
    chunkText
  };
})();
