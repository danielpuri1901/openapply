// Read a company's ATS off its OWN careers page, instead of guessing a URL
// slug. Guessing cannot notice a migration (a company moves ATS and the old
// slug is still well-formed, just gone) and a wrong guess can attach roles to
// the wrong employer. The company's own page is authoritative and cheap.
//
// Board URL shapes, most specific first. Trimmed to the ATSes this repo has a
// provider for (src/discover/providers/); a pattern for an ATS we cannot read
// would resolve and then silently never scrape.
const PATTERNS = [
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([A-Za-z0-9._-]+)/g },
  { ats: 'greenhouse', re: /(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9._-]+)/g },
  // The iframe/script embed. The slug hides in the `for=` query param.
  { ats: 'greenhouse', re: /greenhouse\.io\/embed\/job_board[^"'\s]*?[?&]for=([A-Za-z0-9._-]+)/g },
  { ats: 'lever', re: /jobs\.lever\.co\/([A-Za-z0-9._-]+)/g },
  { ats: 'workable', re: /apply\.workable\.com\/([A-Za-z0-9._-]+)/g },
  { ats: 'recruitee', re: /([A-Za-z0-9-]+)\.recruitee\.com/g },
  { ats: 'teamtailor', re: /([A-Za-z0-9-]+)\.teamtailor\.com/g },
  { ats: 'personio', re: /([A-Za-z0-9-]+)\.jobs\.personio\.(?:de|com)/g },
  { ats: 'bamboohr', re: /([A-Za-z0-9-]+)\.bamboohr\.com/g },
];

// Slugs that are the ATS's own chrome, never an employer.
const NOT_A_SLUG = new Set([
  'embed', 'www', 'api', 'static', 'assets', 'app', 'jobs', 'careers',
  'job_board', 'js', 'cdn', 'images', 'blog', 'help', 'support', 'login',
]);

// Pull every ATS reference out of a page. Pure, no I/O, testable against fixtures.
export function extractAts(html) {
  const tally = new Map();
  const text = String(html || '');
  for (const { ats, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const slug = m[1];
      if (!slug || NOT_A_SLUG.has(slug.toLowerCase())) continue;
      const k = `${ats}|${slug}`;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([k, count]) => ({ ats: k.split('|')[0], slug: k.split('|')[1], count }))
    .sort((a, b) => b.count - a.count);
}

// Decide the single board for a company. Returns null rather than guessing
// when the page references several employers: the signature of an aggregator
// or a portfolio page, not a careers page.
export function pickBoard(hits, { maxDistinctSlugs = 3 } = {}) {
  if (!hits.length) return null;
  const distinct = new Set(hits.map((h) => h.slug));
  if (distinct.size > maxDistinctSlugs) {
    return { ats: null, slug: null, reason: `aggregator: ${distinct.size} distinct boards on one page` };
  }
  const top = hits[0];
  return { ats: top.ats, slug: top.slug, reason: `referenced ${top.count}x` };
}

const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Does this board slug plausibly belong to this company? Catches a startup
// embedding its INVESTOR's talent board on its own careers page, which looks
// perfectly well-formed and is not caught by the aggregator check above.
// A genuine board slug nearly always echoes the company or the domain.
export function slugPlausible(slug, { company = '', domain = '' } = {}) {
  const s = alnum(slug);
  const c = alnum(company);
  const d = alnum(String(domain).split('.')[0]);
  if (!s) return false;
  if (c && s.includes(c)) return true;
  if (c && c.includes(s)) return true;
  if (d && s.includes(d)) return true;
  if (d && d.includes(s)) return true;
  const head = s.slice(0, 4);
  return head.length === 4 && (c.startsWith(head) || d.startsWith(head));
}

// Paths a careers page actually lives at, in rough order of likelihood. Kept
// short: most companies have no ATS at all, and the homepage almost always
// links to the real careers page anyway.
export const CAREERS_PATHS = ['/careers', '/jobs', '/company/careers', '/join'];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

async function get(url, timeoutMs = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': UA } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Resolve one company. Tries its careers page first, then the homepage, which
// often links straight to the board.
export async function resolveFromCareers(domain, { careersUrl = null, paths = CAREERS_PATHS, company = '', fetchText = get } = {}) {
  const base = String(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const readFrom = (url, html) => {
    if (!html) return null;
    const hits = extractAts(html);
    if (!hits.length) return null;
    const picked = pickBoard(hits);
    if (!picked || !picked.ats) {
      return { domain: base, ats: null, slug: null, evidence: url, reason: picked?.reason || 'no board' };
    }
    // Prefer a hit whose slug actually looks like this company. A page can
    // reference an investor's board more often than its own.
    const own = hits.find((h) => slugPlausible(h.slug, { company, domain: base }));
    if (own && own.slug !== picked.slug) {
      return { domain: base, ats: own.ats, slug: own.slug, reason: `own board (${own.count}x), ignored ${picked.slug}`, evidence: url };
    }
    if (!own) {
      return { domain: base, ats: picked.ats, slug: picked.slug, evidence: url, reason: picked.reason, implausible: true };
    }
    return { domain: base, ...picked, evidence: url };
  };

  const first = [careersUrl, `https://${base}/`].filter(Boolean);
  const firstHtml = await Promise.all(first.map((u) => fetchText(u)));
  for (let i = 0; i < first.length; i++) {
    const hit = readFrom(first[i], firstHtml[i]);
    if (hit) return hit;
  }
  if (firstHtml.every((h) => h === null)) {
    return { domain: base, ats: null, slug: null, evidence: null, reason: 'domain unreachable' };
  }

  const urls = paths.map((p) => `https://${base}${p}`).filter((u) => !first.includes(u));
  const htmls = await Promise.all(urls.map((u) => fetchText(u)));
  for (let i = 0; i < urls.length; i++) {
    const hit = readFrom(urls[i], htmls[i]);
    if (hit) return hit;
  }
  return { domain: base, ats: null, slug: null, evidence: null, reason: 'no ATS link found' };
}
