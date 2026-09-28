#!/usr/bin/env node
// scrape.mjs - THE scraper. One run: load the book, fetch each board, parse,
// prefilter, diff against the store, close the gone, gate every new role in
// the same pass. Deterministic, no LLM.
//
// Failure handling:
//   transient (timeout/429/5xx) -> retry once, then give up for this run
//   404                         -> definitive: flag company 'probe', no retry
//   valid empty                -> close known roles, zero_streak++ (3 = probe)
//   malformed                  -> mutate nothing; 3 consecutive on one ATS
//                                  aborts that ATS for the run
// Role state only ever changes on a successful response.
//
// Usage: node src/discover/scrape.mjs

import { probeBoard } from './ats.mjs';
import { geoTier, titleOk } from './match.mjs';
import { isMarketplace, explain } from './marketplace.mjs';
import {
  openDb, companiesToScrape, upsertSweep, markScraped, markMarketplace,
  setGate, boardsOf, ungatedOpen,
} from './db.mjs';
import { loadProfile, toScrape, toFilter } from '../profile.mjs';
import { makeGate } from '../qualify/gate.mjs';

const MALFORMED_BREAK = 3;

function classify(err) {
  const m = String(err?.message || err);
  if (/^404\b/.test(m)) return 'notFound';
  if (/^(408|429|5\d\d)\b|timeout|abort|network|fetch failed|ECONN|ETIMEDOUT/i.test(m)) return 'transient';
  return 'malformed';
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export async function scrape(db, cfg, { probe = probeBoard, gate = null, backoffMs = 1000, now = new Date().toISOString() } = {}) {
  const book = companiesToScrape(db);
  const byAts = new Map();
  for (const c of book) (byAts.get(c.ats) ?? byAts.set(c.ats, []).get(c.ats)).push(c);

  const result = { scraped: 0, newRoles: [], closed: 0, probed: [], failed: [], providerBreaks: [], marketplaces: [], gated: 0, gatePending: 0 };

  await Promise.all([...byAts.entries()].map(async ([ats, companies]) => {
    let malformedStreak = 0;
    for (const { slug, board_slug: boardSlug } of companies) {
      // slug is the company IDENTITY (caps and dedup key on it). boardSlug is
      // where the ATS actually hosts the board, when it differs. Probe with
      // the board address, record with the identity.
      const board = boardSlug || slug;
      let rows, failure;
      try {
        rows = await probe(ats, board);
      } catch (err) {
        failure = classify(err);
        if (failure === 'transient') {
          await sleep(backoffMs);
          try { rows = await probe(ats, board); failure = undefined; } catch (err2) { failure = classify(err2); }
        }
      }

      if (failure === 'notFound') {
        markScraped(db, slug, ats, { notFound: true, now });
        result.probed.push(`${ats}/${slug}`);
        malformedStreak = 0;
        continue;
      }
      if (failure === 'malformed') {
        markScraped(db, slug, ats, { ok: false, now });
        result.failed.push(`${ats}/${slug}: malformed`);
        if (++malformedStreak >= MALFORMED_BREAK) { result.providerBreaks.push(ats); return; }
        continue;
      }
      if (failure === 'transient') {
        markScraped(db, slug, ats, { ok: false, now });
        result.failed.push(`${ats}/${slug}: transient`);
        malformedStreak = 0;
        continue;
      }

      malformedStreak = 0;

      // A successful response is not proof the board belongs to one employer.
      // Sweep it with an EMPTY list so everything previously ingested closes,
      // then retire the board for good.
      const verdict = isMarketplace(rows);
      if (verdict.marketplace) {
        const res = upsertSweep(db, slug, ats, [], { now });
        markScraped(db, slug, ats, { ok: true, jobCount: rows.length, now });
        markMarketplace(db, slug, ats, { now });
        result.closed += res.closed;
        result.marketplaces.push(explain(slug, verdict));
        continue;
      }

      // Annotate + prefilter, then diff. The board's own remote flag is
      // trusted over location text: a remote role can list real cities and
      // still be out of scope for geo text matching, so remote is checked
      // first when the profile accepts remote roles.
      const scoped = rows
        .map((r) => ({
          ...r,
          role_id: r.url.split('/').pop(),
          tier: (cfg.remoteOk && r.remote) ? 'remote' : geoTier(r.loc, cfg.geoKeywords),
        }))
        .filter((r) => r.tier && titleOk(r.title, cfg.titleKeywords, cfg.titleBlock));
      const res = upsertSweep(db, slug, ats, scoped, { now });
      markScraped(db, slug, ats, { ok: true, jobCount: rows.length, now });
      result.scraped++;
      result.closed += res.closed;
      if (!res.baseline) result.newRoles.push(...res.newRoles);
    }
  }));

  // Gate: one pass over every ungated open in-scope role. Simultaneously the
  // verdict for this run's new roles, the retry for gate_pending rows from
  // prior runs, and the backfill for pre-gate-era rows. A gate that throws
  // leaves the role pending, never a guessed verdict.
  if (gate) {
    const boards = boardsOf(db);
    for (const role of ungatedOpen(db)) {
      try {
        const v = await gate({ ...role, board: boards.get(role.company) || role.company });
        setGate(db, role.key, { eligible: v.eligible, reason: v.reason, now });
        result.gated++;
      } catch {
        setGate(db, role.key, { eligible: null, reason: 'gate_pending', now });
        result.gatePending++;
      }
    }
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = loadProfile();
  const cfg = toScrape(profile);
  const filter = toFilter(profile);
  const db = openDb();
  const r = await scrape(db, cfg, { gate: makeGate({ filter }) });
  console.log(`scraped ${r.scraped} boards | ${r.closed} closed | ${r.probed.length} flagged probe | ${r.failed.length} failed | ${r.newRoles.length} NEW | gated ${r.gated} (${r.gatePending} pending)`);
  for (const n of r.newRoles) console.log(`  NEW ${n.company} - ${n.title} (${n.tier}) ${n.applyUrl || n.apply_url || ''}`);
  for (const m of r.marketplaces) console.log(`  RETIRED ${m}`);
  for (const f of r.failed) console.log(`  FAIL ${f}`);
  for (const b of r.providerBreaks) console.log(`  PROVIDER BREAK: ${b} aborted this run`);
}
