#!/usr/bin/env node
// verify.mjs - the machine check that replaces eyeballing a screenshot.
//
// A focus ring can look like a selection, and a set of radios whose raw
// attribute value is the same string on every option can look like the wrong
// one is picked. Both are deterministic facts about a JSON dump, and neither
// needs a human to look at a screenshot. Feed it the output of the `readback`
// snippet:
//   node src/fill/verify.mjs dump.json
//   pbpaste | node src/fill/verify.mjs -
//
// Exit 0 = PASS (safe to hand over). Exit 1 = FAIL, do not present it.
// A BLOCK is something this script knows is wrong. A FLAG is something only a
// human can settle (a consent box, a factual "are you currently based in X").
// Flags never fail the run; they just have to be said out loud.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadProfile, forbiddenList } from '../profile.mjs';
import { buildYesNoRules } from './facts.mjs';

const NEVER_FILL_RE = /I certify|hereby certify|I confirm that all information|consent to be recorded|recording consent|arbitration|acknowledge|export.control/i;
// A residency question is a fact about where someone is, not whether they are
// willing to relocate - the two must never be answered by the same rule.
const RESIDENCY_RE = /(currently\s+)?(are\s+you\s+)?(based|located|residing|reside|live|living)\s+(in|within|near)/i;

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');

export function verify(dump, { profile, city } = {}) {
  const blocks = [];
  const flags = [];
  const passes = [];
  const id = profile.identity || {};
  const fields = dump.fields || [];
  const choices = dump.choices || [];
  const find = (re) => fields.find((f) => re.test(f.label || ''));

  // An empty dump used to sail through as PASS, because a form with no fields
  // has no wrong fields. It means the form is gone, not that the fill is good.
  if (!fields.length && !choices.length) {
    return {
      ok: false,
      blocks: ['dump has no fields and no choices; the form is not on the page (already submitted, not rendered yet, or the tab navigated away)'],
      flags: [], passes: [],
    };
  }

  const nameF = find(/^(full\s+)?(legal\s+)?name$|first and last name/i);
  if (!nameF) flags.push('no Name field found on this form');
  else if (id.full_name && norm(nameF.value) !== norm(id.full_name)) blocks.push(`Name is "${nameF.value || '(empty)'}", expected "${id.full_name}"`);
  else passes.push('name');

  const emailF = fields.find((f) => f.kind === 'email') || find(/email/i);
  if (emailF && id.email && norm(emailF.value).toLowerCase() !== norm(id.email).toLowerCase()) blocks.push(`Email is "${emailF.value || '(empty)'}", expected "${id.email}"`);
  else if (emailF) passes.push('email');

  const phoneF = fields.find((f) => f.kind === 'tel') || find(/phone/i);
  if (phoneF && phoneF.value && id.phone && digits(phoneF.value) !== digits(id.phone)) blocks.push(`Phone digits are "${digits(phoneF.value)}", expected "${digits(id.phone)}"`);
  else if (phoneF && phoneF.value) passes.push('phone');

  const resumeF = fields.find((f) => f.kind === 'file' && /resume|cv/i.test(f.label || ''));
  if (resumeF && !resumeF.value) blocks.push('resume field is EMPTY');
  else if (resumeF) passes.push(`resume = ${resumeF.value}`);

  const yesNo = buildYesNoRules(profile, { city: city || dump.city });
  for (const c of choices) {
    const q = norm(c.question);
    if (!q) continue;
    if (NEVER_FILL_RE.test(q) || RESIDENCY_RE.test(q)) {
      flags.push(`"${q.slice(0, 90)}" -> ${c.selected.length ? c.selected.join(',') : 'UNANSWERED'} (human judgment)`);
      continue;
    }
    if (!c.selected.length) {
      if (c.required) blocks.push(`REQUIRED and unanswered: "${q.slice(0, 100)}"`);
      else flags.push(`unanswered (optional): "${q.slice(0, 80)}"`);
      continue;
    }
    if (c.selected.length > 1 && c.kind !== 'checkbox') { blocks.push(`more than one option selected on "${q.slice(0, 80)}": ${c.selected.join(',')}`); continue; }
    const rule = yesNo.find((r) => new RegExp(r.source, r.flags).test(q));
    if (!rule) { passes.push(`answered: ${q.slice(0, 50)} -> ${c.selected.join(',')}`); continue; }
    const got = norm(c.selected[0]);
    if (!/^(yes|no)$/i.test(got)) { passes.push(`${q.slice(0, 40)} -> ${got}`); continue; }
    if (got.toLowerCase() !== rule.value.toLowerCase()) blocks.push(`POLARITY: "${q.slice(0, 100)}" answered ${got}, expected ${rule.value}`);
    else passes.push(`polarity ok: ${q.slice(0, 45)} -> ${got}`);
  }

  const lenOf = (f) => (typeof f.length === 'number' ? f.length : String(f.value || '').length);
  for (const f of fields) {
    if (f.required && f.kind !== 'file' && lenOf(f) === 0) blocks.push(`REQUIRED and empty: "${f.label || '(unlabelled)'}"`);
  }

  const banned = forbiddenList(profile);
  for (const f of fields) {
    if ((f.kind !== 'textarea' && f.kind !== 'text') || lenOf(f) <= 120) continue;
    if (Array.isArray(f.hits)) {
      for (const h of f.hits) blocks.push(`forbidden term in "${f.label}": ${h}`);
      if (!f.hits.length) passes.push(`free text ok: ${f.label.slice(0, 40)} (${lenOf(f)} chars)`);
      continue;
    }
    if (/[—–]/.test(f.value)) blocks.push(`em or en dash in "${f.label}"`);
    if (/[‘’“”]/.test(f.value)) blocks.push(`curly quote in "${f.label}"`);
    for (const term of banned) {
      if (term && f.value.toLowerCase().includes(String(term).toLowerCase())) blocks.push(`forbidden term "${term}" in "${f.label}"`);
    }
    passes.push(`free text ok: ${f.label.slice(0, 40)} (${lenOf(f)} chars)`);
  }

  return { ok: blocks.length === 0, blocks, flags, passes };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: verify.mjs <dump.json|->'); process.exit(2); }
  let raw;
  try {
    raw = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg), 'utf8');
  } catch (e) { console.error(`cannot read dump: ${e.message}`); process.exit(2); }

  let dump;
  try { dump = JSON.parse(raw.trim()); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) { console.error('dump is not JSON'); process.exit(2); }
    try { dump = JSON.parse(m[0]); } catch { console.error('dump is not JSON'); process.exit(2); }
  }

  const r = verify(dump, { profile: loadProfile() });
  if (r.flags.length) {
    console.log('FLAGS (your call, not blocking):');
    for (const f of r.flags) console.log(`  ? ${f}`);
    console.log('');
  }
  if (!r.ok) {
    console.error(`FAIL: ${r.blocks.length} problem(s). Do NOT present this fill.`);
    for (const b of r.blocks) console.error(`  x ${b}`);
    process.exit(1);
  }
  console.log(`PASS: ${r.passes.length} checks clean on ${dump.url || 'the form'}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
