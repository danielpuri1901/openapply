#!/usr/bin/env node
// pool.mjs - build the pool of eligible, not-applied roles: dedupe by
// company AND board slug (one employer can appear under two boards), cap
// roles per company, then pre-screen each form through the ATS API before
// any tab opens. Writes output/pool.json with lane 'no-essay' or 'essay'.
//
// Usage: node src/screen/pool.mjs [--limit N]

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadProfile, toFilter, ROOT } from '../profile.mjs';
import { openDb, eligibleOpen, norm } from '../discover/db.mjs';
import { prescreen } from './forms.mjs';

const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Drop duplicate postings for the same company + title seen under two board
// slugs (a company mid-migration, or tracked twice). First occurrence wins.
export function dedupeRoles(roles) {
  const seen = new Set();
  const out = [];
  for (const r of roles) {
    const k = `${norm(r.company)}|${normTitle(r.title)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// Cap how many roles from one company enter the pool in one build.
export function capPerCompany(roles, max) {
  const counts = new Map();
  const out = [];
  for (const r of roles) {
    const k = norm(r.company);
    const n = counts.get(k) || 0;
    if (n >= max) continue;
    counts.set(k, n + 1);
    out.push(r);
  }
  return out;
}

/**
 * @param {object} db the discover store (src/discover/db.mjs openDb())
 * @param {object} filter shape from src/profile.mjs toFilter()
 * @param {object} [opts]
 * @param {number} [opts.limit] cap how many roles get pre-screened (API budget)
 * @param {function} [opts.screen] injectable prescreen(ats, board, jobId)
 */
export async function buildPool(db, filter, { limit = Infinity, screen = prescreen } = {}) {
  const eligible = eligibleOpen(db);
  const deduped = dedupeRoles(eligible);
  const capped = capPerCompany(deduped, filter.max_apps_per_company);
  const toScreen = capped.slice(0, limit);

  const picks = [];
  for (const r of toScreen) {
    let lane = 'essay', reason = 'prescreen-failed';
    try {
      const v = await screen(r.ats, r.board, r.role_id);
      lane = v.lane;
      reason = (v.reasons || []).join('; ') || 'ok';
    } catch (err) {
      reason = String(err.message || err);
      if (/closed/.test(reason)) continue;
    }
    picks.push({ ...r, lane, reason });
  }

  return {
    eligible: eligible.length, deduped: deduped.length, capped: capped.length,
    screened: picks.length,
    noEssay: picks.filter((p) => p.lane === 'no-essay').length,
    essay: picks.filter((p) => p.lane === 'essay').length,
    picks,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--limit');
  const limit = i !== -1 ? Number(args[i + 1]) : Infinity;

  const profile = loadProfile();
  const filter = toFilter(profile);
  const db = openDb();
  const result = await buildPool(db, filter, { limit });

  const outDir = path.join(ROOT, 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'pool.json'), JSON.stringify(result.picks, null, 2));

  console.log(`eligible ${result.eligible} | deduped ${result.deduped} | capped ${result.capped} | screened ${result.screened} | no-essay ${result.noEssay} | essay ${result.essay}`);
}
