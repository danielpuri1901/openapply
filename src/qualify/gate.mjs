// gate.mjs - the ingest gate: one deterministic verdict per genuinely-new
// role, run inside the scrape (qualify-at-ingest). A gate that throws (JD
// fetch failed) propagates: the scraper records the role gate_pending and
// retries next run. A gate never guesses.
import path from 'node:path';
import { fetchJd as realFetchJd } from '../discover/ats.mjs';
import { norm } from '../discover/db.mjs';
import { anyWordMatch } from '../discover/match.mjs';
import { checkEligibility } from './eligibility.mjs';
import { checkDedup } from './dedup.mjs';
import { ROOT } from '../profile.mjs';

/**
 * @param {object} opts
 * @param {object} opts.filter shape from src/profile.mjs toFilter()
 * @param {function} [opts.fetchJd] injectable for tests
 * @param {string} [opts.appsDir] defaults to data/applications
 * @returns {function(role): Promise<{eligible: 0|1, reason: string}>}
 */
export function makeGate({
  filter, fetchJd = realFetchJd, appsDir = path.join(ROOT, 'data', 'applications'),
  now = new Date().toISOString(),
} = {}) {
  return async (role) => {
    const key = norm(role.company);

    if ((filter.blocked_companies || []).some((c) => norm(c) === key)) {
      return { eligible: 0, reason: 'company-blocked' };
    }

    // Runs before the JD fetch, so a blocked title costs no network call.
    if (anyWordMatch(role.title || '', filter.exclude_titles)) {
      return { eligible: 0, reason: 'excluded-title' };
    }

    const dd = checkDedup(role.company, {
      appsDir, role: role.title, now: Date.parse(now),
      maxApps: filter.max_apps_per_company,
      windowDays: filter.max_apps_window_days,
      reapplyGapDays: filter.reapply_gap_days,
    });
    if (dd.blocked) return { eligible: 0, reason: dd.reason };

    // Fetch from the board address (role.board), cap against the identity above.
    const jd = await fetchJd(role.ats, role.board || role.company, role.role_id);

    // role.loc is the location the ingest step already stored; preferred over
    // re-deriving it from JD prose, which repeats office-list boilerplate
    // across every posting a company makes.
    const v = checkEligibility(jd, role.loc, filter);
    if (!v.eligible) return { eligible: 0, reason: v.reason };

    return { eligible: 1, reason: dd.reason === 'cooldown' ? `cooldown:${dd.lastAppliedDaysAgo}d` : 'ok' };
  };
}
