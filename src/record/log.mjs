#!/usr/bin/env node
// log.mjs - the fill flywheel's memory, plus the one place that records a real
// submitted application.
//
// Two different things get logged here, and they are not the same event:
//   - `fill`    a browser fill attempt happened. Appends one line to
//               fill-log.jsonl (outcome, trap codes, turns, notes). A form can
//               be filled and still sit unsubmitted in an open tab, so this
//               never touches application history.
//   - `applied` a human (or, with auto_submit_no_essay, the agent after
//               review) actually clicked Submit. Writes
//               data/applications/<norm(company)>.json, shape:
//                 { company, ats, applications: [{ role, url, appliedAt }] }
//               norm() is src/discover/db.mjs's identity normalizer, the same
//               key src/qualify/dedup.mjs reads and the same key the CrawlDb
//               caps and dedup on. It also calls markApplied() so the SQLite
//               `discovered.status` stays in sync - without that,
//               src/screen/pool.mjs keeps offering an already-applied role.
//
// Usage:
//   node src/record/log.mjs fill '{"company":"Acme","url":"...","outcome":"filled","ats":"ashby","traps":["FIELD_NOT_COMMITTED"],"turns":7}'
//   node src/record/log.mjs applied "Acme" "https://jobs.ashbyhq.com/acme/123"
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadProfile } from '../profile.mjs';
import { openDb, norm, markApplied } from '../discover/db.mjs';
import { release as releaseLease } from './leases.mjs';

export const LOG_FILE = path.join(ROOT, 'data', 'fill-log.jsonl');
export const APPLICATIONS_DIR = path.join(ROOT, 'data', 'applications');

// Canonical trap vocabulary. A known code makes the per-ATS summary countable
// instead of a pile of prose; free-text notes are still fine alongside it.
export const TRAPS = {
  FIELD_NOT_COMMITTED: 'value sat in the DOM but the ATS reported it missing; it only saves on a bubbling focusout, run the commit snippet before Submit',
  FIELDSET_MISSED: 'a required multi-choice question sat in a <fieldset> outside the normal field wrapper',
  BACKGROUND_TAB_STALL: 'timers or Submit stalled because the tab was not in front',
  COORD_CLICK_NEEDED: 'a ref click focused the field but typing did not land; a coordinate click was needed',
  RESUME_PARSER_OVERWRITE: 'the resume parser autofill overwrote Name, Email or Location after upload',
  COMBOBOX_NOT_COMMITTED: 'a react-select combobox showed typed text but never committed a real option',
  PHONE_COUNTRY_LOOKALIKE: 'the phone country picker matched a look-alike entry instead of the full label',
  IFRAME_EMBED: 'the form was an embedded iframe unreachable from the parent page; open the direct embed URL',
  SLOW_RENDER: 'the form had no inputs for several seconds after navigation',
  TAB_REUSED: 'a tab holding an unsubmitted fill was navigated away and the fill was lost',
  EMPTY_DUMP: 'the readback found no fields; the form was already gone or not yet rendered',
  DEFAULT_AUTOFILL: 'a combobox auto-filled a default value the user never chose',
};

// One lease per posting, not per company - a company can have several open
// roles being preflighted at once.
export function leaseKey(company, url) {
  const c = norm(company) || 'company';
  const u = norm(String(url || '').replace(/^https?:\/\//, '').split('?')[0]) || 'posting';
  return `${c}::${u}`;
}

export function appendFill(entry, { file = LOG_FILE } = {}) {
  const row = {
    at: entry.at || new Date().toISOString(),
    company: entry.company || null,
    role: entry.role || null,
    ats: entry.ats || null,
    url: entry.url || null,
    outcome: entry.outcome || 'unknown', // filled | partial | blocked | skipped
    fieldsFilled: entry.fieldsFilled ?? null,
    fieldsLeft: Array.isArray(entry.fieldsLeft) ? entry.fieldsLeft : [],
    traps: Array.isArray(entry.traps) ? entry.traps : [],
    turns: entry.turns ?? null, // browser round-trips spent, the efficiency metric
    notes: entry.notes || '',
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}

export function readLog({ file = LOG_FILE } = {}) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// What went wrong on this ATS before. Read this BEFORE filling one.
export function trapsFor(ats, { file = LOG_FILE } = {}) {
  const counts = {};
  for (const r of readLog({ file })) {
    if (ats && r.ats !== ats) continue;
    for (const t of r.traps) counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function summarise({ file = LOG_FILE } = {}) {
  const rows = readLog({ file });
  const byOutcome = {};
  const byAts = {};
  const trapCounts = {};
  let turns = 0;
  let withTurns = 0;
  for (const r of rows) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
    byAts[r.ats] = byAts[r.ats] || { n: 0, traps: 0, turns: 0 };
    byAts[r.ats].n++;
    byAts[r.ats].traps += r.traps.length;
    if (typeof r.turns === 'number') { byAts[r.ats].turns += r.turns; turns += r.turns; withTurns++; }
    for (const t of r.traps) trapCounts[t] = (trapCounts[t] || 0) + 1;
  }
  return {
    total: rows.length,
    byOutcome,
    byAts,
    avgTurns: withTurns ? +(turns / withTurns).toFixed(1) : null,
    topTraps: Object.entries(trapCounts).sort((a, b) => b[1] - a[1]),
  };
}

// ── application history: data/applications/<norm(company)>.json ───────────
// Owned jointly with src/qualify/dedup.mjs (reads it) and src/screen/pool.mjs
// (reads discovered.status, which recordApplied keeps in sync via markApplied).

export function applicationsFile(company, { dir = APPLICATIONS_DIR } = {}) {
  return path.join(dir, `${norm(company)}.json`);
}

export function readApplicationsFile(company, { dir = APPLICATIONS_DIR } = {}) {
  const file = applicationsFile(company, { dir });
  if (!fs.existsSync(file)) return { company, ats: null, applications: [] };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { company: d.company || company, ats: d.ats ?? null, applications: Array.isArray(d.applications) ? d.applications : [] };
  } catch { return { company, ats: null, applications: [] }; }
}

export function recordApplied(company, url, { role = null, ats = null, appliedAt = new Date().toISOString(), dir = APPLICATIONS_DIR } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const rec = readApplicationsFile(company, { dir });
  rec.company = company;
  if (ats) rec.ats = ats;
  const i = rec.applications.findIndex((a) => a.url === url);
  const entry = { role, url, appliedAt };
  if (i >= 0) rec.applications[i] = { ...rec.applications[i], ...entry };
  else rec.applications.push(entry);
  fs.writeFileSync(applicationsFile(company, { dir }), JSON.stringify(rec, null, 2));
  return rec;
}

// Every applications record, flattened to one row per posting, for status.mjs.
export function readAllApplications({ dir = APPLICATIONS_DIR } = {}) {
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const a of d.applications || []) rows.push({ company: d.company, ats: d.ats, ...a });
    } catch { /* skip unreadable file */ }
  }
  return rows;
}

// Look up the discovered role_id for a posting so the SQLite status can be
// kept in sync. Best-effort: a posting applied to outside the scrape pipeline
// will not be in `discovered`, and that is fine - history still gets written.
export function findDiscovered(db, company, url) {
  return db.prepare('SELECT ats, role_id FROM discovered WHERE company = ? AND (url = ? OR apply_url = ?) LIMIT 1')
    .get(norm(company), url, url) || null;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'fill') {
    const arg = rest[0];
    if (!arg) { console.error('usage: log.mjs fill <json|file.json>'); process.exit(2); }
    const raw = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
    let entry;
    try { entry = JSON.parse(raw); } catch { console.error('fill payload is not JSON'); process.exit(2); }
    console.log(JSON.stringify(appendFill(entry)));
    return;
  }
  if (cmd === 'applied') {
    const [company, url] = rest;
    if (!company || !url) { console.error('usage: log.mjs applied "<Company>" <url>'); process.exit(2); }
    loadProfile(); // fail fast when profile.md is missing, same as every other command
    const db = openDb();
    const found = findDiscovered(db, company, url);
    const rec = recordApplied(company, url, { ats: found?.ats });
    if (found) markApplied(db, company, found.ats, found.role_id);
    releaseLease(leaseKey(company, url), 'delivered');
    console.log(JSON.stringify(rec));
    return;
  }
  // `skip` ends a posting without applying (closed, blocked, human said no),
  // so its lease does not hold the company for the full lease window.
  if (cmd === 'skip') {
    const [company, url, ...why] = rest;
    if (!company || !url) { console.error('usage: log.mjs skip "<Company>" <url> [reason]'); process.exit(2); }
    releaseLease(leaseKey(company, url), 'released');
    console.log(JSON.stringify({ skipped: company, url, reason: why.join(' ') || null }));
    return;
  }
  console.error('usage: log.mjs <fill <json>|applied "<Company>" <url>|skip "<Company>" <url> [reason]>');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
