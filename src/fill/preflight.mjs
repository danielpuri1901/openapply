#!/usr/bin/env node
// preflight.mjs - the hard gate the fill flow must clear before touching a
// browser. Claims the dedup key BEFORE any externally visible side effect
// (opening a real ATS tab IS the side effect), in code, not in a prose
// instruction a session can skip.
//
// Dedup mechanics (window caps, reapply gap) live in src/qualify/dedup.mjs,
// reading the same data/applications/<norm(company)>.json history that
// src/record/log.mjs writes. This module only resolves which limits apply
// (profile defaults, or a per-company override) and owns the lease, which is
// specific to the fill step, not to qualification.
//
// Usage: node src/fill/preflight.mjs "<Company>" <posting-url>
// Exit codes (load-bearing): 0 GO/WARN, 2 REFUSE - never open the tab on REFUSE.
import { loadProfile } from '../profile.mjs';
import { checkDedup } from '../qualify/dedup.mjs';
import { leaseKey, trapsFor, TRAPS, APPLICATIONS_DIR } from '../record/log.mjs';
import { claim as claimLease } from '../record/leases.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function detectAts(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('ashbyhq.com')) return 'ashby';
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('lever.co')) return 'lever';
  return null;
}

export function preflight(company, url, {
  now = Date.now(),
  profile = loadProfile(),
  appsDir = APPLICATIONS_DIR,
  claim = claimLease,
} = {}) {
  const limits = profile.limits || {};

  if ((limits.blocked_companies || []).some((b) => norm(b) === norm(company))) {
    return { go: false, reason: 'blocked-company' };
  }

  // A company-published cap overrides the default, because breaking a rule the
  // company states on its own form is worse than any missed application.
  const rules = limits.company_rules || {};
  const ruleKey = Object.keys(rules).find((k) => norm(k) === norm(company));
  const rule = ruleKey ? rules[ruleKey] : {};

  const dedup = checkDedup(company, {
    appsDir,
    maxApps: rule.max_apps ?? limits.max_apps_per_company ?? 2,
    windowDays: rule.window_days ?? limits.window_days ?? 90,
    reapplyGapDays: limits.reapply_gap_days ?? 14,
    now,
  });
  if (dedup.blocked) return { go: false, reason: dedup.reason, priorCount: dedup.priorCount };

  const key = leaseKey(company, url);
  const c = claim(key, { now });
  if (!c.claimed) return { go: false, reason: `lease-held (${c.reason})` };

  return { go: true, cooldown: dedup.reason === 'cooldown' ? dedup.lastAppliedDaysAgo : null, priorCount: dedup.priorCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [company, url] = process.argv.slice(2);
  if (!company || !url) {
    console.error('usage: preflight.mjs "<Company>" <posting-url>');
    process.exit(2);
  }

  const r = preflight(company, url);
  if (!r.go) {
    console.error(`REFUSE: ${company} - ${r.reason}. Do NOT open the tab.`);
    process.exit(2);
  }
  if (r.cooldown != null) console.log(`WARN: applied to ${company} ${r.cooldown} days ago, under cap. Your call. Lease claimed - GO.`);
  else console.log(`GO: ${company} clear, lease claimed.`);

  console.log('\nBrowser checklist:');
  console.log('  1. confirm Claude in Chrome is connected to the right browser');
  console.log('  2. open one fresh tab for this posting; never reuse a tab that holds an unsubmitted fill');

  const ats = detectAts(url);
  if (ats) {
    const traps = trapsFor(ats);
    if (traps.length) {
      console.log(`\nKnown traps on ${ats} (handle up front):`);
      for (const [code, n] of traps) console.log(`  ${String(n).padStart(2)}x ${code} - ${TRAPS[code] || ''}`);
    }
  }
  process.exit(0);
}
