// THE retrieval contract. All ATS board access goes through this module.
// Endpoint URLs and row shape live in providers/*.mjs (boardUrl/parseBoard,
// one source of truth per ATS). This is a thin slug-addressed wrapper.

import * as ashby from './providers/ashby.mjs';
import * as greenhouse from './providers/greenhouse.mjs';
import * as lever from './providers/lever.mjs';
import * as bamboohr from './providers/bamboohr.mjs';
import * as workable from './providers/workable.mjs';
import * as recruitee from './providers/recruitee.mjs';
import * as teamtailor from './providers/teamtailor.mjs';
import * as personio from './providers/personio.mjs';

export const PROVIDERS = { ashby, greenhouse, lever, bamboohr, workable, recruitee, teamtailor, personio };

const defaultFetchJson = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

async function loadRows(ats, slug, fetchJson) {
  const provider = PROVIDERS[ats];
  if (!provider) throw new Error(`unknown ats: ${ats}`);
  const data = await fetchJson(provider.boardUrl(slug));
  return provider.parseBoard(data, slug);
}

// One board's open postings, normalized. Used by the scraper.
export async function probeBoard(ats, slug, { fetchJson = defaultFetchJson } = {}) {
  const rows = await loadRows(ats, slug, fetchJson);
  return rows.map(({ title, url, applyUrl, location, remote, onSiteStated }) => ({
    ats, company: slug, title: title || '', loc: location || '', url, applyUrl,
    remote: remote === true, onSiteStated: onSiteStated === true,
  }));
}

// One posting's job description text plus board-declared facts. Used by the gate.
export async function fetchJd(ats, slug, jobId, { fetchJson = defaultFetchJson } = {}) {
  const rows = await loadRows(ats, slug, fetchJson);
  const hit = rows.find((r) => String(r.id) === String(jobId) || (r.url && r.url.includes(jobId)));
  if (!hit) throw new Error(`job ${jobId} not on ${ats}/${slug}`);
  return {
    title: hit.title || '', loc: hit.location || '', remote: hit.remote === true,
    // Board explicitly said OnSite/Hybrid. Distinct from remote === false, which
    // is also what a board that stated nothing at all produces.
    onSiteStated: hit.onSiteStated === true,
    text: hit.text,
  };
}

// CLI: probe|jd, JSON lines to stdout, exit 1 on error.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ats, slug, jobId] = process.argv.slice(2);
  try {
    if (cmd === 'probe') (await probeBoard(ats, slug)).forEach((r) => console.log(JSON.stringify(r)));
    else if (cmd === 'jd') console.log(JSON.stringify(await fetchJd(ats, slug, jobId)));
    else { console.error('usage: ats.mjs probe <ats> <slug> | jd <ats> <slug> <jobId>'); process.exit(1); }
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
