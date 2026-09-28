#!/usr/bin/env node
// seed.mjs - load the starter board list into the book, so a first scrape has
// companies to read. No network here: `scrape` verifies each board, and a board
// that no longer exists is flagged there, not guessed about here.
//
// Usage: node src/discover/seed.mjs [file]   (default seeds/boards.txt)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../profile.mjs';
import { openDb, upsertCompany } from './db.mjs';

export const SUPPORTED = new Set(['ashby', 'greenhouse', 'lever', 'workable', 'recruitee', 'personio', 'teamtailor', 'bamboohr']);

export function parseSeed(text) {
  const boards = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [ats, slug] = line.split(/\s+/);
    if (SUPPORTED.has(ats) && slug) boards.push({ ats, slug });
  }
  return boards;
}

export function seed(db, boards) {
  let added = 0;
  for (const b of boards) added += upsertCompany(db, { slug: b.slug, ats: b.ats, boardSlug: b.slug });
  return added;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] || path.join(ROOT, 'seeds', 'boards.txt');
  const boards = parseSeed(readFileSync(file, 'utf8'));
  const added = seed(openDb(), boards);
  console.log(`seeded ${added} new boards (${boards.length} in ${path.relative(ROOT, file)}). Next: npm run scrape`);
}
