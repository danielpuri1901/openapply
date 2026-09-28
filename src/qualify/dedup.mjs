// dedup.mjs - decides whether a role is still worth applying to, based on
// this company's application history.
//
// History lives in data/applications/<slug>.json, written by
// `node src/record/log.mjs applied <company> <url>`. Shape:
//   { company, ats, applications: [{ role, url, appliedAt }] }
// slug is the normalized company identity (src/discover/db.mjs norm()), the
// same key the CrawlDb caps and dedup on, so "Modal Labs" and "modal" read
// the same file regardless of which name a caller passes.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { norm } from '../discover/db.mjs';

const DAY = 86_400_000;

export function readHistory(appsDir, company) {
  const file = path.join(appsDir, `${norm(company)}.json`);
  if (!existsSync(file)) return [];
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(d.applications) ? d.applications : [];
  } catch {
    return [];
  }
}

// Titles drift ("Forward Deployed Engineer" vs "... - NYC"), so role matching
// compares normalized words rather than exact strings.
const normRole = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameRole = (a, b) => {
  const x = normRole(a), y = normRole(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};

/**
 * @param {string} company
 * @param {object} opts
 * @param {string} [opts.role] the posting under consideration. Scopes the
 *   reapply gap to THAT role: a company can have several open roles, and a
 *   company-wide gap would refuse a genuinely different posting.
 * @param {number} [opts.maxApps] applications allowed per rolling windowDays
 * @param {number} [opts.reapplyGapDays] minimum gap between hits on the same role
 */
export function checkDedup(company, {
  appsDir, role = null, maxApps = 2, windowDays = 7, reapplyGapDays = 60, now = Date.now(),
} = {}) {
  const history = readHistory(appsDir, company)
    .map((a) => ({ ...a, t: Date.parse(a.appliedAt) }))
    .filter((a) => !Number.isNaN(a.t));

  const windowCount = history.filter((a) => now - a.t < windowDays * DAY).length;
  if (windowCount >= maxApps) {
    return { blocked: true, reason: `max-${maxApps}-per-${windowDays}d`, priorCount: history.length, windowCount };
  }

  const sameRoleStamps = (role ? history.filter((a) => sameRole(a.role, role)) : history).map((a) => a.t);
  const lastSameRole = sameRoleStamps.length ? Math.max(...sameRoleStamps) : null;
  if (lastSameRole != null && now - lastSameRole < reapplyGapDays * DAY) {
    return {
      blocked: true, reason: `reapply-gap-${reapplyGapDays}d`,
      priorCount: history.length, sameRoleDaysAgo: Math.floor((now - lastSameRole) / DAY),
    };
  }

  const lastApplied = history.length ? Math.max(...history.map((a) => a.t)) : null;
  return {
    blocked: false, reason: lastApplied != null ? 'cooldown' : 'ok',
    priorCount: history.length,
    lastAppliedDaysAgo: lastApplied == null ? null : Math.floor((now - lastApplied) / DAY),
  };
}
