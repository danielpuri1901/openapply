// Answers one question about a board: is this ONE employer, or a marketplace
// posting other companies' jobs (a recruiting agency, an investor portfolio
// page)? Applying to one of those postings applies to the marketplace, not to
// a company, so the whole board is noise.
//
// The signal is not board size and not duplicate titles: a real employer can
// legitimately post the same title across many cities. The signal is the same
// title at the same LOCATION, repeated past what one employer plausibly opens.

export const MAX_SAME_TITLE_LOC = 4;

const key = (r) => `${String(r.title || '').trim().toLowerCase()}|${String(r.loc ?? r.location ?? '').trim().toLowerCase()}`;

export function isMarketplace(rows, { threshold = MAX_SAME_TITLE_LOC } = {}) {
  const counts = new Map();
  for (const r of rows || []) counts.set(key(r), (counts.get(key(r)) || 0) + 1);

  let maxRepeat = 0, worst = null;
  for (const [k, n] of counts) if (n > maxRepeat) { maxRepeat = n; worst = k; }

  const [title = null, loc = null] = worst ? worst.split('|') : [];
  return { marketplace: maxRepeat >= threshold, maxRepeat, title, loc, roles: (rows || []).length };
}

// One line a human can read in a scrape summary.
export function explain(slug, verdict) {
  return `${slug}: ${verdict.roles} roles, "${verdict.title}" at "${verdict.loc}" posted ${verdict.maxRepeat}x`
    + (verdict.marketplace ? ' -> MARKETPLACE, not one employer' : '');
}
