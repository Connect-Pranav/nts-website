// Turns an AI draft into a feed-ready LinkedIn post: strips script labels the writer sometimes
// leaves in ("Hook:", "Slide 2:", "CTA:"), removes markdown LinkedIn would show literally, and lays
// it out the way LinkedIn reads well: hook line, blank line, short paragraphs, hashtags last.
// Shared by the worker (drafting + publishing) and the console (preview + "Fix format").

// any bullet or emoji in front of a label: ◆ 🔹 • - * ✅ …
const LABEL = /^\s*(?:[^\p{L}\p{N}\s"“'‘([#@]{1,4}\s*)?(?:\*\*)?(hook|slide\s*\d+|takeaway|cta|call to action|caption|body|intro|outro|post|headline|title|closing|conclusion|summary)(?:\*\*)?\s*[:\-–—]\s*/iu;
// list bullets the writer uses; turned into one consistent arrow
const BULLET = /^\s*(?:[-*•◆◇▪▫►▶→✅✔☑■□●○◾◽]|🔹|🔸|🔷|🔶|👉)\uFE0F?\s+/u;
const TAGS_LINE = /^(\s*#[\p{L}\p{N}_]+\s*)+$/u;

/** Problems a reader would notice in the feed. */
export function lintPost(text) {
  const t = String(text || '');
  const issues = [];
  const lines = t.split('\n');
  if (lines.some((l) => LABEL.test(l))) issues.push('Script labels like “Hook:” or “Slide 1:” would be posted as text.');
  if (/\*\*[^*]+\*\*|^#{1,6}\s/m.test(t)) issues.push('Markdown (** or #) shows as raw symbols on LinkedIn.');
  const first = lines.find((l) => l.trim()) || '';
  if (first.length > 150) issues.push('The first line is long: only about 140–210 characters show before “…more”.');
  const body = lines.filter((l) => l.trim() && !TAGS_LINE.test(l));
  if (body.length > 4 && !/\n\s*\n/.test(t)) issues.push('No blank lines: the post will read as one dense block.');
  if (/link in (the )?comments|download (our|the|my) free|free template|dm me for/i.test(t)) issues.push('Promises a link, download or template: make sure it really exists before posting.');
  return issues;
}

/** Feed-ready text. Idempotent: running it twice gives the same result. */
export function polishPost(text) {
  let lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/, '').replace(/\s+$/, ''));
  const tags = [];
  lines = lines.filter((l) => {
    if (TAGS_LINE.test(l)) {
      tags.push(...l.trim().split(/\s+/));
      return false;
    }
    return true;
  });
  const out = [];
  let firstDone = false;
  for (const raw of lines) {
    if (!raw.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const m = raw.match(LABEL);
    let l = raw;
    if (m) {
      const kind = m[1].toLowerCase();
      l = raw.slice(m[0].length).trim();
      if (kind === 'hook' || kind === 'headline' || kind === 'title') l = l.replace(/^["“'](.*)["”']$/, '$1');
      // the hook stands alone; a takeaway or CTA starts its own paragraph
      if (/^(takeaway|cta|call to action|closing|conclusion|summary)$/.test(kind) && out.length && out[out.length - 1] !== '') out.push('');
      if (/^slide/.test(kind)) l = `→ ${l}`;
    } else if (BULLET.test(raw)) {
      l = raw.replace(BULLET, '→ ');
    }
    out.push(l);
    if (!firstDone) {
      firstDone = true;
      out.push('');
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  // a list item followed by plain text gets a blank line in between
  const spaced = [];
  out.forEach((l, k) => {
    const prev = spaced[spaced.length - 1];
    if (k && l && prev && prev.startsWith('→ ') !== l.startsWith('→ ')) spaced.push('');
    spaced.push(l);
  });
  const seen = new Set();
  const uniq = tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 5);
  return spaced.join('\n').replace(/\n{3,}/g, '\n\n').trim() + (uniq.length ? `\n\n${uniq.join(' ')}` : '');
}
