#!/usr/bin/env node
// letter.mjs - build a cover letter PDF for one company, for forms that have a
// cover letter upload slot. The body is the golden `cover-letter` answer with
// {company}, {role} and {hook} swapped in; nothing else is generated. The letter
// is refused while the per-company hook is missing or the text fails the
// humanizer, so no unchecked text reaches a PDF.
//
// Usage: node src/tailor/letter.mjs <company> --role "<role>" --hook "<line>" [--city X]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadProfile, forbiddenList } from '../profile.mjs';
import { loadAnswers, resolveAnswersDir, swapCompany, HOOK_MARKER } from '../answers/answers.mjs';
import { check, neverWords, DEFAULT_AI_VOCAB } from '../shared/humanizer.mjs';
import { compile, detectEngine } from './cv.mjs';

const TEMPLATE = path.join(ROOT, 'cv', 'cover-letter.template.tex');

// Escapes the characters LaTeX treats as commands, so answer text prints as written.
export function latexEscape(s) {
  return String(s)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// Returns { body, problems }. Problems block the build.
export function letterBody(answerText, { company, role, hook, profile }) {
  const body = swapCompany(answerText, company, hook).replaceAll('{role}', role || 'open');
  const problems = [];
  if (body.includes(HOOK_MARKER)) problems.push('hook missing: pass --hook with one line from a real source about the company');
  const vocab = [...DEFAULT_AI_VOCAB, ...neverWords(profile.body)];
  for (const v of check(body, { vocab, forbidden: forbiddenList(profile) })) problems.push(`humanizer: ${v.rule} ${v.word || v.fact || ''}`.trim());
  return { body, problems };
}

export function fillTemplate(template, { profile, company, body, city, date }) {
  const id = profile.identity;
  const loc = city && profile.location.answer
    ? profile.location.answer.replace('{city}', city.split(',')[0].trim())
    : profile.location.current;
  const paragraphs = body.split(/\n\s*\n/).map((p) => latexEscape(p.replace(/\s*\n\s*/g, ' ').trim())).join('\n\n');
  return template
    .replaceAll('{{NAME}}', latexEscape(id.full_name))
    .replaceAll('{{EMAIL}}', latexEscape(id.email))
    .replaceAll('{{PHONE}}', latexEscape(id.phone || ''))
    .replaceAll('{{LOCATION}}', latexEscape(loc.includes('{city}') ? profile.location.current : loc))
    .replaceAll('{{DATE}}', latexEscape(date))
    .replaceAll('{{COMPANY}}', latexEscape(company))
    .replaceAll('{{BODY}}', paragraphs);
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const company = args[0];
  if (!company || company.startsWith('--')) {
    console.error('Usage: node src/tailor/letter.mjs <company> --role "<role>" --hook "<line>" [--city X]');
    process.exit(2);
  }
  const profile = loadProfile();
  const answer = loadAnswers(resolveAnswersDir()).find((a) => a.id === 'cover-letter');
  if (!answer) {
    console.error('No golden answer with id "cover-letter" in answers/. Write one first (see answers.example/cover-letter.md).');
    process.exit(1);
  }
  const { body, problems } = letterBody(answer.text, { company, role: opt('--role'), hook: opt('--hook'), profile });
  if (problems.length) {
    console.log(JSON.stringify({ built: false, problems, body }, null, 2));
    process.exit(3);
  }
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const tex = fillTemplate(readFileSync(TEMPLATE, 'utf8'), { profile, company, body, city: opt('--city'), date });
  const outDir = path.join(ROOT, 'output');
  mkdirSync(outDir, { recursive: true });
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outTex = path.join(outDir, `cover-letter-${slug}.tex`);
  writeFileSync(outTex, tex);
  const engine = detectEngine();
  if (!engine) { console.log(JSON.stringify({ built: false, problems: ['no LaTeX engine: install tectonic or pdflatex'] })); process.exit(1); }
  const pdf = compile(engine, outTex, outDir);
  const finalPdf = path.join(outDir, `cover-letter-${slug}.pdf`);
  if (pdf !== finalPdf && existsSync(pdf)) writeFileSync(finalPdf, readFileSync(pdf));
  console.log(JSON.stringify({ built: true, pdf: finalPdf, words: body.split(/\s+/).length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
