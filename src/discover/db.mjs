// The discovery store: one SQLite file with two tables.
//   companies  - the book that drives the scraper (one row per board)
//   discovered - one row per (company, ats, role_id) ever seen
//
// A discovery run is a DIFF against `discovered`, not a fresh search:
// upsertSweep() inserts new roles, touches seen ones, closes vanished ones,
// and returns the genuinely-new set. First sight of a company is a baseline
// (fires nothing, so a freshly-added board does not dump its whole history
// into the "NEW" list).
//
// Rebuildable cache: lose the file, one full sweep re-seeds it as baseline.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { ROOT } from '../profile.mjs';

export const DEFAULT_DB = path.join(ROOT, 'data', 'openapply.sqlite');

// Identity normalizer. Keys and caps queries use it; NEVER apply it to a board
// slug used as an API address ("modal-labs" normalized would 404).
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The true company identity hides in the ATS URL. Used by dedup so "Modal
// Labs" (display name) and slug "modal" (API address) are one identity.
export function slugFromAtsUrl(url) {
  const m = String(url || '').match(/(?:jobs\.ashbyhq\.com|jobs\.lever\.co|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io)\/([^/?#]+)/i);
  return m && m[1] !== 'embed' ? m[1].toLowerCase() : null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS discovered (
  key TEXT PRIMARY KEY, company TEXT NOT NULL, ats TEXT NOT NULL, role_id TEXT NOT NULL,
  title TEXT, loc TEXT, tier TEXT, url TEXT, apply_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  eligible INTEGER, gate_reason TEXT, applied_at TEXT,
  first_seen TEXT NOT NULL, last_checked TEXT NOT NULL, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_company ON discovered(company, ats);
CREATE INDEX IF NOT EXISTS idx_disc_status ON discovered(status, tier, eligible);
CREATE TABLE IF NOT EXISTS companies (
  slug TEXT NOT NULL, ats TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_scraped TEXT, last_ok TEXT, zero_streak INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  -- Where the ATS actually hosts the board, when it differs from the identity
  -- slug. NULL means "same as slug". slug is the identity caps and dedup key
  -- on; overwriting it with the board address splits one company into two.
  board_slug TEXT,
  PRIMARY KEY (slug, ats)
);`;

export function openDb(dbPath = DEFAULT_DB) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}

/**
 * Diff one company's current board rows against the store.
 * rows: [{ role_id, title, loc, tier, url, applyUrl }]
 * Returns { baseline, newRoles, closed }. Idempotent: re-running the same
 * rows yields no newRoles.
 */
export function upsertSweep(db, company, ats, rows, { now = new Date().toISOString() } = {}) {
  company = norm(company);
  const prefix = `${company}|${ats}|`;
  const key = (r) => `${prefix}${r.role_id}`;
  const existing = new Set(
    db.prepare('SELECT key FROM discovered WHERE key LIKE ?')
      .all(`${prefix}%`).map((x) => x.key.slice(prefix.length)),
  );
  const baseline = existing.size === 0;

  const up = db.prepare(`
    INSERT INTO discovered (key, company, ats, role_id, title, loc, tier, url, apply_url, status, first_seen, last_checked)
    VALUES ($key, $company, $ats, $role_id, $title, $loc, $tier, $url, $apply_url, 'open', $now, $now)
    ON CONFLICT(key) DO UPDATE SET
      last_checked = $now, title = $title, loc = $loc, tier = $tier,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
      closed_at = CASE WHEN status = 'closed' THEN NULL ELSE closed_at END`);

  const newRoles = [];
  for (const r of rows) {
    up.run({
      $key: key(r), $company: company, $ats: ats, $role_id: r.role_id,
      $title: r.title ?? null, $loc: r.loc ?? null, $tier: r.tier ?? null,
      $url: r.url ?? null, $apply_url: r.applyUrl ?? r.apply_url ?? null, $now: now,
    });
    if (!existing.has(r.role_id) && !baseline) newRoles.push({ ...r, key: key(r) });
  }

  const closed = reconcileClosed(db, company, ats, rows.map((r) => r.role_id), { now });
  return { baseline, newRoles, seen: rows.length, closed };
}

// Mark open roles we knew but the board no longer lists as closed.
export function reconcileClosed(db, company, ats, currentRoleIds, { now = new Date().toISOString() } = {}) {
  const prefix = `${norm(company)}|${ats}|`;
  const known = db.prepare("SELECT key FROM discovered WHERE key LIKE ? AND status = 'open'")
    .all(`${prefix}%`).map((x) => x.key.slice(prefix.length));
  const live = new Set(currentRoleIds);
  const gone = known.filter((id) => !live.has(id));
  const close = db.prepare("UPDATE discovered SET status = 'closed', closed_at = ? WHERE key = ?");
  for (const id of gone) close.run(now, `${prefix}${id}`);
  return gone.length;
}

// Mark a role applied. Exported for src/record/log.mjs so a fill outcome
// takes the role out of the pool.
export function markApplied(db, company, ats, roleId, { now = new Date().toISOString() } = {}) {
  return db.prepare("UPDATE discovered SET status = 'applied', applied_at = ?, last_checked = ? WHERE key = ?")
    .run(now, now, `${norm(company)}|${ats}|${roleId}`).changes;
}

// Retire a board that turned out to be a marketplace rather than one employer.
export function markMarketplace(db, slug, ats, { now = new Date().toISOString() } = {}) {
  return db.prepare("UPDATE companies SET status = 'marketplace', last_scraped = ? WHERE slug = ? AND ats = ?")
    .run(now, slug, ats).changes;
}

// Record the ingest gate's verdict on a role row. eligible: 1 | 0 | null (pending).
export function setGate(db, key, { eligible, reason, now = new Date().toISOString() }) {
  return db.prepare('UPDATE discovered SET eligible = ?, gate_reason = ?, last_checked = ? WHERE key = ?')
    .run(eligible, reason, now, key).changes;
}

// Open, in-scope, gated-eligible, not-yet-applied roles, joined with the
// board address the pre-screen APIs need (board_slug, falling back to slug).
export function eligibleOpen(db) {
  return db.prepare(`
    SELECT d.key, d.company, d.ats, d.role_id, d.title, d.loc, d.tier, d.url, d.apply_url,
           COALESCE(c.board_slug, c.slug, d.company) AS board
    FROM discovered d
    LEFT JOIN companies c ON c.slug = d.company AND c.ats = d.ats
    WHERE d.status = 'open' AND d.tier IS NOT NULL AND d.eligible = 1
    ORDER BY d.first_seen DESC`).all();
}

// Add a company to the book. slug is an API address, stored VERBATIM (a
// normed "modal-labs" would 404). Idempotent.
export function upsertCompany(db, { slug, ats, boardSlug = null, now = new Date().toISOString() }) {
  return db.prepare(`INSERT INTO companies (slug, ats, board_slug, added_at) VALUES (?, ?, ?, ?)
                     ON CONFLICT(slug, ats) DO NOTHING`).run(String(slug).trim(), ats, boardSlug, now).changes;
}

// The LOAD query: active companies, never-scraped first, then stalest first.
export function companiesToScrape(db) {
  return db.prepare(`SELECT * FROM companies WHERE status = 'active'
                     ORDER BY last_scraped ASC NULLS FIRST, slug ASC`).all();
}

// Record a scrape attempt's outcome on the book row.
//  - notFound (404): definitive - flag 'probe' for slug re-resolution.
//  - ok, jobs > 0:   healthy - reset streak, stamp last_ok.
//  - ok, 0 jobs:     ambiguous - bump zero_streak; 3 consecutive = 'probe'.
//  - not ok:         transient - only advance last_scraped (next run retries).
export function markScraped(db, slug, ats, { ok = false, jobCount = 0, notFound = false, now = new Date().toISOString() } = {}) {
  if (notFound) {
    return db.prepare("UPDATE companies SET status = 'probe', last_scraped = ? WHERE slug = ? AND ats = ?")
      .run(now, slug, ats).changes;
  }
  if (ok && jobCount > 0) {
    return db.prepare("UPDATE companies SET last_scraped = ?, last_ok = ?, zero_streak = 0 WHERE slug = ? AND ats = ?")
      .run(now, now, slug, ats).changes;
  }
  if (ok) {
    return db.prepare(`UPDATE companies SET last_scraped = ?, zero_streak = zero_streak + 1,
                       status = CASE WHEN zero_streak + 1 >= 3 THEN 'probe' ELSE status END
                       WHERE slug = ? AND ats = ?`).run(now, slug, ats).changes;
  }
  return db.prepare('UPDATE companies SET last_scraped = ? WHERE slug = ? AND ats = ?')
    .run(now, slug, ats).changes;
}

// slug -> board_slug (or slug itself when the board lives at the same
// address as the identity). The JD lives at the board slug, which can differ
// from the company identity; without this every role at such a company
// 404s on JD fetch and parks as gate_pending forever.
export function boardsOf(db) {
  return new Map(db.prepare('SELECT slug, board_slug FROM companies')
    .all().map((r) => [r.slug, r.board_slug || r.slug]));
}

// Open, in-scope roles the gate has not yet ruled on (new this run, or
// pending from a prior run whose gate call threw).
export function ungatedOpen(db) {
  return db.prepare(`SELECT key, company, ats, role_id, title, loc, tier FROM discovered
                     WHERE status = 'open' AND tier IS NOT NULL AND eligible IS NULL`).all();
}

// Funnel counts for src/record/status.mjs.
export function stats(db) {
  const book = db.prepare("SELECT COUNT(*) n FROM companies WHERE status = 'active'").get().n;
  const open = db.prepare("SELECT COUNT(*) n FROM discovered WHERE status = 'open'").get().n;
  const eligible = db.prepare("SELECT COUNT(*) n FROM discovered WHERE status = 'open' AND eligible = 1").get().n;
  const pending = db.prepare("SELECT COUNT(*) n FROM discovered WHERE status = 'open' AND eligible IS NULL").get().n;
  const applied = db.prepare("SELECT COUNT(*) n FROM discovered WHERE status = 'applied'").get().n;
  return { book, open, eligible, gatePending: pending, applied };
}
