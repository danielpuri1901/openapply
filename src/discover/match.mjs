// Word-boundary keyword matching. One source for both the scraper prefilter
// and the qualify gate, so they cannot drift apart (a real run had a geo
// tier missing from the gate because the two sides used different lists).
//
// A bare substring match is a real bug, not a hypothetical: the geo keyword
// "us" matched inside "Belarus" in the real run. Every match here anchors on
// word boundaries instead.

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function wordMatch(text, keyword) {
  if (!keyword) return false;
  const re = new RegExp(`\\b${escapeRe(String(keyword).toLowerCase())}\\b`, 'i');
  return re.test(String(text || ''));
}

export function anyWordMatch(text, keywords) {
  return (keywords || []).some((k) => wordMatch(text, k));
}

// tiers: { tierName: [keyword, ...] }. Returns the first tier name whose
// keyword list matches text on a word boundary, or null.
export function geoTier(text, tiers) {
  const t = String(text || '');
  for (const [name, keywords] of Object.entries(tiers || {})) {
    if (anyWordMatch(t, keywords)) return name;
  }
  return null;
}

// A title is ok when it matches at least one wanted keyword and no blocked one.
export function titleOk(title, titleKeywords, titleBlock) {
  if (anyWordMatch(title, titleBlock)) return false;
  return anyWordMatch(title, titleKeywords);
}
