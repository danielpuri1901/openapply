// Build a city-tailored CV from the user's own .tex source and compile it,
// or check a compiled CV PDF for structure and leaked facts.
//
// build reads profile.cv.tex (the user's filled copy of cv/template.tex),
// swaps the "% OPENAPPLY:LOCATION" line for a city, and compiles with
// tectonic or pdflatex, whichever is on PATH.
// check extracts PDF text with pdftotext and flags missing sections, an
// unrecoverable contact, too many pages, or a forbidden fact.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadProfile, forbiddenList } from '../profile.mjs';

const REQUIRED_SECTIONS = ['Education', 'Experience', 'Technical Skills'];
const LOCATION_MARKER = /^.*% OPENAPPLY:LOCATION\s*$/m;

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

// Rewrites the "% OPENAPPLY:LOCATION" line with the location the user gave
// for this city, falling back to the profile's own current location.
export function applyCityVariant(tex, profile, city) {
  if (!LOCATION_MARKER.test(tex)) {
    throw new Error('CV source has no "% OPENAPPLY:LOCATION" marker line');
  }
  const template = profile.location.answer || profile.location.current;
  const text = city ? template.replace('{city}', city) : profile.location.current;
  return tex.replace(LOCATION_MARKER, `    \\small ${text} % OPENAPPLY:LOCATION`);
}

// Structural checks that must hold before spending a compile.
export function validateTex(content) {
  const issues = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(`\\section{${section}}`)) issues.push(`missing section: ${section}`);
  }
  if (!content.includes('\\begin{document}')) issues.push('missing \\begin{document}');
  if (!content.includes('\\end{document}')) issues.push('missing \\end{document}');
  if (!content.includes('\\pdfgentounicode=1')) issues.push('missing \\pdfgentounicode=1 (ATS compatibility)');
  const unresolved = content.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (unresolved) issues.push(`unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`);
  return issues;
}

// Probes a few common version flags: poppler tools (pdftotext) reject
// "--version" as an unknown filename but accept "-v".
export function commandExists(cmd) {
  for (const args of [['--version'], ['-v']]) {
    try {
      execFileSync(cmd, args, { stdio: 'pipe' });
      return true;
    } catch { /* try next flag */ }
  }
  return false;
}

// First LaTeX engine found on PATH, tectonic preferred (auto-fetches packages).
export function detectEngine() {
  return ['tectonic', 'pdflatex'].find(commandExists) || null;
}

// Compiles texPath (inside outDir) to a PDF of the same base name in outDir.
export function compile(engine, texPath, outDir) {
  const texDir = path.dirname(texPath);
  const base = path.basename(texPath, '.tex');
  let compilePath = texPath;
  if (engine === 'tectonic') {
    // tectonic does not know pdflatex-only primitives.
    const content = readFileSync(texPath, 'utf8')
      .replace(/\\pdfgentounicode\s*=\s*\d+[^\n]*\n?/g, '')
      .replace(/\\input\{glyphtounicode\}[^\n]*\n?/g, '');
    compilePath = path.join(texDir, `${base}._tectonic.tex`);
    writeFileSync(compilePath, content);
    execFileSync('tectonic', ['--outdir', outDir, compilePath], { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
  } else {
    const args = ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', `-output-directory=${outDir}`, texPath];
    execFileSync('pdflatex', args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
    execFileSync('pdflatex', args, { cwd: texDir, stdio: 'pipe', timeout: 120_000 });
  }
  const compiledBase = engine === 'tectonic' ? `${base}._tectonic` : base;
  for (const ext of ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.synctex.gz']) {
    try { rmSync(path.join(outDir, `${compiledBase}${ext}`)); } catch { /* not produced */ }
  }
  if (engine === 'tectonic') { try { rmSync(compilePath); } catch { /* already gone */ } }
  return path.join(outDir, `${compiledBase}.pdf`);
}

function resolveCvPath(profile) {
  const p = profile.cv?.tex || 'cv/cv.tex';
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function build(city) {
  const profile = loadProfile();
  const texPath = resolveCvPath(profile);
  if (!existsSync(texPath)) {
    console.log(JSON.stringify({
      pass: false,
      reason: `no CV source at ${texPath}. Run onboarding to build it from cv/template.tex.`,
    }, null, 2));
    process.exit(1);
  }

  let tex = readFileSync(texPath, 'utf8');
  if (city) tex = applyCityVariant(tex, profile, city);

  const issues = validateTex(tex);
  const outDir = path.join(ROOT, 'output');
  mkdirSync(outDir, { recursive: true });
  const slug = city ? slugify(city) : 'default';
  const outTex = path.join(outDir, `cv-${slug}.tex`);
  writeFileSync(outTex, tex);

  const report = { tex: outTex, issues, valid: issues.length === 0 };
  if (issues.length) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const engine = detectEngine();
  if (!engine) {
    report.compiled = false;
    report.compileError = 'no LaTeX engine found. Install tectonic or pdflatex, then re-run.';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.engine = engine;

  try {
    const compiledPdf = compile(engine, outTex, outDir);
    const outPdf = path.join(outDir, `cv-${slug}.pdf`);
    if (compiledPdf !== outPdf) {
      writeFileSync(outPdf, readFileSync(compiledPdf));
    }
    report.compiled = true;
    report.pdf = outPdf;
    report.pdfSizeKB = parseFloat((statSync(outPdf).size / 1024).toFixed(1));
  } catch (err) {
    report.compiled = false;
    report.compileError = err.message;
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.compiled ? 0 : 1);
}

// Checks extracted CV text against the profile: sections, page count,
// recoverable contact info, and forbidden facts. Pure function for testing.
export function checkCvText(text, profile) {
  const pages = (text.match(/\f/g) || []).length || 1;
  const flags = [];
  if (pages > 2) flags.push(`too many pages (${pages}, max 2)`);
  for (const section of ['Experience', 'Education', 'Skills']) {
    if (!new RegExp(section, 'i').test(text)) flags.push(`missing section: ${section}`);
  }
  const email = profile.identity?.email;
  const phone = profile.identity?.phone;
  const contactFound = (email && text.includes(email)) || (phone && text.includes(phone));
  if (!contactFound) flags.push('contact info not recoverable (email/phone not found in PDF text)');
  for (const fact of forbiddenList(profile)) {
    if (fact && text.toLowerCase().includes(String(fact).toLowerCase())) {
      flags.push(`forbidden fact present: ${fact}`);
    }
  }
  return { pass: flags.length === 0, pages, flags };
}

function check(pdfPath) {
  const profile = loadProfile();
  if (!commandExists('pdftotext')) {
    console.log(JSON.stringify({
      pass: false,
      reason: 'pdftotext is not installed, cannot verify PDF content. Install poppler (brew install poppler).',
    }, null, 2));
    process.exit(1);
  }
  const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  const report = checkCvText(text, profile);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'build') {
    const cityIdx = rest.indexOf('--city');
    const city = cityIdx >= 0 ? rest[cityIdx + 1] : null;
    build(city);
  } else if (cmd === 'check') {
    if (!rest[0]) {
      console.error('Usage: node src/tailor/cv.mjs check <pdf>');
      process.exit(2);
    }
    check(rest[0]);
  } else {
    console.error('Usage: node src/tailor/cv.mjs build [--city X] | check <pdf>');
    process.exit(2);
  }
}
