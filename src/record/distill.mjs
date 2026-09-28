#!/usr/bin/env node
// distill.mjs - the read half of the fill flywheel: which traps have fired
// enough times to deserve a written rule, and are not yet in skills/ats-notes.md.
//
// It does not write rules; turning a note into a rule is a judgment call. It
// only tells you which ones are owed one, which is the step that keeps slipping
// when the log is write-only.
//
// Usage: node src/record/distill.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../profile.mjs';
import { readLog, TRAPS } from './log.mjs';

export const RECUR = 2;
const DOCS_FILE = path.join(ROOT, 'skills', 'ats-notes.md');

export function tokensOf(note) {
  const out = new Set();
  const text = String(note || '');
  const pats = [
    /`([^`]{3,40})`/g,
    /\b([a-z]+[A-Z][A-Za-z]{2,})\b/g,
    /\b([a-z]{3,}_[a-z_]{2,})\b/g,
    /\b([A-Z]{3,}(?:_[A-Z]{2,})+)\b/g,
    /(\[[a-z-]+[*^]?=[^\]]+\])/g,
    /\b([a-z]+\.[a-z]{2,}\(\))/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  }
  return [...out].filter((t) => t.length >= 3);
}

const STOP = new Set(['the', 'and', 'not', 'did', 'but', 'was', 'has', 'had', 'for', 'a', 'an',
  'it', 'is', 'to', 'in', 'on', 'of', 'or', 'so', 'that', 'this', 'with', 'from', 'needed', 'until']);

export function contentWords(s) {
  return [...new Set(String(s || '').toLowerCase().match(/[a-z][a-z-]{2,}/g) || [])]
    .filter((w) => !STOP.has(w));
}

export function distill(rows, docsText, { recur = RECUR } = {}) {
  const doc = String(docsText || '').toLowerCase();
  const inDocs = (s) => doc.includes(String(s).toLowerCase());
  const described = (desc) => {
    const words = contentWords(desc);
    if (words.length < 3) return false;
    const hit = words.filter((w) => doc.includes(w)).length;
    return hit / words.length >= 0.6;
  };

  const counts = {};
  for (const r of rows) {
    for (const t of r.traps || []) {
      const k = `${r.ats || 'unknown'}::${t}`;
      counts[k] = counts[k] || { ats: r.ats, code: t, n: 0, where: [] };
      counts[k].n++;
      counts[k].where.push(r.company);
    }
  }
  const gaps = Object.values(counts)
    .filter((c) => c.n >= recur)
    .map((c) => ({ ...c, written: inDocs(c.code) || described(TRAPS[c.code]) }))
    .sort((a, b) => b.n - a.n);

  const unwritten = [];
  for (const r of rows) {
    if (!r.notes || r.notes.length < 60) continue;
    const toks = tokensOf(r.notes);
    if (!toks.length) continue;
    const missing = toks.filter((t) => !inDocs(t));
    if (missing.length && missing.length === toks.length) {
      unwritten.push({ company: r.company, ats: r.ats, at: r.at, missing, notes: r.notes });
    }
  }
  return { gaps, unwritten };
}

function main() {
  const rows = readLog();
  const docsText = existsSync(DOCS_FILE) ? readFileSync(DOCS_FILE, 'utf8') : '';
  const { gaps, unwritten } = distill(rows, docsText);
  const owed = gaps.filter((g) => !g.written);

  console.log(`${rows.length} fills logged. ${gaps.length} traps have fired ${RECUR}+ times.\n`);
  console.log(owed.length ? 'recurring and not in skills/ats-notes.md - write these first:' : 'every recurring trap is written down.');
  for (const g of owed) {
    console.log(`  ${String(g.n).padStart(2)}x ${g.code} on ${g.ats} (${[...new Set(g.where)].join(', ')})`);
    if (TRAPS[g.code]) console.log(`        ${TRAPS[g.code]}`);
  }

  if (unwritten.length) {
    console.log(`\n${unwritten.length} note(s) whose specifics never reached the docs:`);
    for (const u of unwritten) {
      console.log(`  ${u.company} (${u.ats}, ${u.at})`);
      console.log(`      unwritten terms: ${u.missing.slice(0, 6).join(', ')}`);
    }
  } else {
    console.log('\nno note has specifics missing from the docs.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
