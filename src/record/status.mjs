#!/usr/bin/env node
// status.mjs - the funnel, read from what discover/screen/record have written.
// book/eligible come from the SQLite store (src/discover/db.mjs stats());
// pool is read best-effort from output/pool.json; filled/applied/top traps
// come from this module's own files. Never fails when an earlier step has
// not run yet - each section degrades independently.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../profile.mjs';
import { openDb, stats, DEFAULT_DB } from '../discover/db.mjs';
import { readAllApplications, summarise, APPLICATIONS_DIR, LOG_FILE } from './log.mjs';

function readPool(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data.length : (data.roles?.length ?? data.length ?? null);
  } catch { return null; }
}

function isToday(iso) {
  if (!iso) return false;
  return String(iso).slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function status({
  dbPath = DEFAULT_DB,
  appsDir = APPLICATIONS_DIR,
  logFile = LOG_FILE,
  poolFile = path.join(ROOT, 'output', 'pool.json'),
} = {}) {
  const db = openDb(dbPath);
  const s = stats(db);
  const applications = readAllApplications({ dir: appsDir });
  const log = summarise({ file: logFile });
  return {
    book: s.book,
    eligible: s.eligible,
    pool: readPool(poolFile),
    filled: log.byOutcome.filled || 0,
    appliedToday: applications.filter((a) => isToday(a.appliedAt)).length,
    appliedTotal: applications.length,
    avgTurns: log.avgTurns,
    topTraps: log.topTraps.slice(0, 5),
  };
}

function main() {
  const s = status();
  console.log('OpenApply funnel');
  console.log(`  book:          ${s.book}`);
  console.log(`  eligible:      ${s.eligible}`);
  console.log(`  pool:          ${s.pool ?? 'not run yet (npm run pool)'}`);
  console.log(`  filled:        ${s.filled}`);
  console.log(`  applied today: ${s.appliedToday}`);
  console.log(`  applied total: ${s.appliedTotal}`);
  console.log(`  avg turns:     ${s.avgTurns ?? 'n/a'}`);
  if (s.topTraps.length) {
    console.log('  top traps:');
    for (const [code, n] of s.topTraps) console.log(`    ${String(n).padStart(2)}x ${code}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
