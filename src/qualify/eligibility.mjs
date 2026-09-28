// eligibility.mjs - deterministic geo + years-of-experience check against the
// profile's filter (src/profile.mjs toFilter). Zero tokens, zero LLM.
//
// Geo priority, in order: the board's own remote flag (trusted over any JD
// text, per the profile's remote_ok/always_allow), then the structured
// location field the ingest step stored, then the JD text as a last resort
// when the board states no location at all. A structured location that
// matches no tier is a reject; it never falls through to text, because
// boilerplate like "our SF, NYC or London offices" appears in every JD a
// company posts and would let an SF-only role pass an NYC-only tier.
import { geoTier, anyWordMatch } from '../discover/match.mjs';

// Extract a "minimum years of experience" demand from JD text. Conservative:
// only fires on explicit "N+ years" / "at least N years" patterns.
export function extractMinYoe(jdText) {
  const text = (jdText || '').toLowerCase();
  let max = 0;
  const patterns = [
    /(\d{1,2})\s*\+?\s*years?\s+(?:of\s+)?(?:[a-z-]+\s+){0,3}experience/g,
    /at least\s+(\d{1,2})\s+years?/g,
    /minimum (?:of )?(\d{1,2})\s+years?/g,
    /(\d{1,2})\s*\+\s*(?:years?|yrs?)\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

const tierMap = (tiers) => Object.fromEntries((tiers || []).map((t) => [t.name, t.keywords || []]));

/**
 * @param {{text: string, remote: boolean}} jd from src/discover/ats.mjs fetchJd
 * @param {string} loc the ingest-time structured location, may be empty
 * @param {object} filter shape from src/profile.mjs toFilter()
 * @returns {{eligible: boolean, reason: string, matchedTier: string|null, minYoe: number}}
 */
export function checkEligibility(jd, loc, filter) {
  const geo = filter.geo || {};
  const remoteOk = (geo.always_allow || []).includes('remote');
  let matchedTier = null;

  if (remoteOk && jd.remote) {
    matchedTier = 'remote';
  } else {
    const text = loc || jd.text || '';
    if (anyWordMatch(text, geo.block)) return { eligible: false, reason: 'geo', matchedTier: null, minYoe: 0 };
    matchedTier = geoTier(text, tierMap(geo.tiers));
    if (!matchedTier) return { eligible: false, reason: 'geo', matchedTier: null, minYoe: 0 };
  }

  const minYoe = extractMinYoe(jd.text || '');
  if (typeof filter.yoe_ceiling === 'number' && minYoe > filter.yoe_ceiling) {
    return { eligible: false, reason: 'yoe', matchedTier, minYoe };
  }

  return { eligible: true, reason: 'ok', matchedTier, minYoe };
}
