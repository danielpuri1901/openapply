#!/usr/bin/env node
// add-company.mjs - resolve a company's ATS board and add it to the book.
//
// Takes either a direct ATS board URL (jobs.ashbyhq.com/foo) or a careers
// page / company domain. A direct URL is read with the same pattern matcher
// used to scan a page (extractAts), so the two paths share one source of
// truth for "what a board URL looks like". A resolved board is then verified
// with a real API call before it is written to the book: a well-formed slug
// that 404s is not a company, it is a guess.
//
// Usage: node src/discover/add-company.mjs <careers-url or ats-board-url>

import { extractAts, resolveFromCareers } from './careers.mjs';
import { probeBoard } from './ats.mjs';
import { openDb, upsertCompany } from './db.mjs';

export async function addCompany(input, { db, fetchText, fetchJson } = {}) {
  const direct = extractAts(input);
  let ats, slug, reason;

  if (direct.length) {
    ({ ats, slug } = direct[0]);
    reason = 'direct board URL';
  } else {
    const resolved = await resolveFromCareers(input, { fetchText });
    if (!resolved.ats) return { ok: false, reason: resolved.reason || 'no ATS link found' };
    ({ ats, slug } = resolved);
    reason = resolved.reason;
  }

  let rows;
  try {
    rows = await probeBoard(ats, slug, fetchJson ? { fetchJson } : {});
  } catch (err) {
    return { ok: false, ats, slug, reason: `resolved but API rejected it: ${err.message || err}` };
  }

  upsertCompany(db, { slug, ats });
  return { ok: true, ats, slug, reason, jobCount: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: add-company.mjs <careers-url or ats-board-url>');
    process.exit(1);
  }
  const db = openDb();
  const r = await addCompany(input, { db });
  if (!r.ok) {
    console.error(`could not add ${input}: ${r.reason}`);
    process.exit(1);
  }
  console.log(`added ${r.ats}/${r.slug} (${r.jobCount} open roles, ${r.reason})`);
}
