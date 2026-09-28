import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadProfile } from '../profile.mjs';
import { applyCityVariant, validateTex, checkCvText, detectEngine, commandExists } from './cv.mjs';

const example = path.join(ROOT, 'profile.example.md');
const profile = loadProfile(example);

test('applyCityVariant swaps the OPENAPPLY:LOCATION line for a city', () => {
  const tex = 'before\n\\small OLD % OPENAPPLY:LOCATION\nafter\n';
  const out = applyCityVariant(tex, profile, 'Berlin');
  assert.match(out, /Lisbon, Portugal \(relocating to Berlin\) % OPENAPPLY:LOCATION/);
  assert.doesNotMatch(out, /OLD/);
});

test('applyCityVariant falls back to current location with no city', () => {
  const tex = '\\small OLD % OPENAPPLY:LOCATION\n';
  const out = applyCityVariant(tex, profile, null);
  assert.match(out, /Lisbon, Portugal % OPENAPPLY:LOCATION/);
});

test('applyCityVariant throws when the marker line is missing', () => {
  assert.throws(() => applyCityVariant('no marker here', profile, 'Berlin'), /OPENAPPLY:LOCATION/);
});

test('validateTex flags missing sections, missing document tags, and unresolved placeholders', () => {
  const issues = validateTex('\\section{Education}\n{{FULL_NAME}}');
  assert.ok(issues.some((i) => i.includes('missing section: Experience')));
  assert.ok(issues.some((i) => i.includes('missing \\begin{document}')));
  assert.ok(issues.some((i) => i.includes('unresolved placeholders')));
});

test('validateTex passes a complete document', () => {
  const template = readFileSync(path.join(ROOT, 'cv/template.tex'), 'utf8');
  const filled = fillTemplate(template);
  assert.deepEqual(validateTex(filled), []);
});

test('checkCvText passes a well-formed CV and flags problems', () => {
  const good = 'Experience\nEducation\nSkills\nalex.rivera@example.com';
  const goodReport = checkCvText(good, profile);
  assert.equal(goodReport.pass, true);

  const missingSection = 'Experience\nSkills\nalex.rivera@example.com';
  const flagged = checkCvText(missingSection, profile);
  assert.equal(flagged.pass, false);
  assert.ok(flagged.flags.some((f) => f.includes('Education')));

  const noContact = 'Experience\nEducation\nSkills';
  assert.ok(checkCvText(noContact, profile).flags.some((f) => f.includes('contact info')));

  const tooLong = 'Experience\nEducation\nSkills\nalex.rivera@example.com' + '\f'.repeat(3);
  assert.ok(checkCvText(tooLong, profile).flags.some((f) => f.includes('too many pages')));
});

test('checkCvText flags a forbidden fact', () => {
  const withForbidden = { ...profile, forbidden: { ...profile.forbidden, names: ['Secret Employer'] } };
  const text = 'Experience\nEducation\nSkills\nalex.rivera@example.com\nSecret Employer';
  assert.ok(checkCvText(text, withForbidden).flags.some((f) => f.includes('Secret Employer')));
});

test('detectEngine and commandExists run without throwing', () => {
  const engine = detectEngine();
  assert.ok(engine === null || typeof engine === 'string');
  assert.equal(typeof commandExists('node'), 'boolean');
  assert.equal(commandExists('node'), true);
});

// End-to-end: fill the template like onboarding would, build a default and a
// city variant through the real CLI, then check the compiled PDFs. Skips
// when no LaTeX engine is on PATH, same as the tool itself does.
test('cv build + check compiles a real PDF and passes checkCvText', { skip: detectEngine() ? false : 'no LaTeX engine on PATH' }, () => {
  const cvTexPath = path.join(ROOT, 'cv/cv.tex');
  const outDir = path.join(ROOT, 'output');
  const cleanup = () => {
    for (const f of [cvTexPath, path.join(outDir, 'cv-default.tex'), path.join(outDir, 'cv-default.pdf'),
      path.join(outDir, 'cv-berlin.tex'), path.join(outDir, 'cv-berlin.pdf')]) {
      if (existsSync(f)) rmSync(f);
    }
  };
  cleanup();
  try {
    const template = readFileSync(path.join(ROOT, 'cv/template.tex'), 'utf8');
    mkdirSync(path.dirname(cvTexPath), { recursive: true });
    writeFileSync(cvTexPath, fillTemplate(template));

    const env = { ...process.env, OPENAPPLY_PROFILE: example };
    const buildOut = JSON.parse(execFileSync('node', ['src/tailor/cv.mjs', 'build'], { cwd: ROOT, env, encoding: 'utf8' }));
    assert.equal(buildOut.compiled, true);
    assert.ok(existsSync(buildOut.pdf));
    assert.ok(statSync(buildOut.pdf).size > 0);

    const checkOut = JSON.parse(execFileSync('node', ['src/tailor/cv.mjs', 'check', buildOut.pdf], { cwd: ROOT, env, encoding: 'utf8' }));
    assert.equal(checkOut.pass, true);
    assert.equal(checkOut.pages, 1);

    const cityOut = JSON.parse(execFileSync('node', ['src/tailor/cv.mjs', 'build', '--city', 'Berlin'], { cwd: ROOT, env, encoding: 'utf8' }));
    assert.equal(cityOut.compiled, true);
    const cityTex = readFileSync(path.join(outDir, 'cv-berlin.tex'), 'utf8');
    assert.match(cityTex, /relocating to Berlin/);
  } finally {
    cleanup();
  }
});

function fillTemplate(template) {
  const subs = {
    FULL_NAME: 'Alex Rivera',
    LOCATION: 'Lisbon, Portugal',
    PHONE: '+351 912 345 678',
    EMAIL: 'alex.rivera@example.com',
    LINKEDIN: 'linkedin.com/in/alex-rivera-example',
    GITHUB: 'github.com/alex-rivera-example',
    EDU_SCHOOL: 'University of Lisbon', EDU_LOCATION: 'Lisbon, Portugal',
    EDU_DEGREE: 'BSc Computer Science', EDU_DATES: 'Sep 2022 -- Jul 2025',
    EXP1_TITLE: 'Software Engineer', EXP1_DATES: 'Aug 2025 -- Present',
    EXP1_ORG: 'Example Labs', EXP1_LOCATION: 'Lisbon, Portugal',
    EXP1_BULLET1: 'Built an internal tool that cut report preparation from two days to two hours.',
    EXP1_BULLET2: 'Replaced a manual weekly export with a scheduled pipeline.',
    EXP1_BULLET3: 'Wrote the on-call runbook the team still uses.',
    EXP2_TITLE: 'Teaching Assistant', EXP2_DATES: 'Sep 2024 -- Jun 2025',
    EXP2_ORG: 'University of Lisbon', EXP2_LOCATION: 'Lisbon, Portugal',
    EXP2_BULLET1: 'Graded assignments for an algorithms course.',
    EXP2_BULLET2: 'Held weekly office hours for 30 students.',
    PROJ1_NAME: 'Ticket Retrieval', PROJ1_STACK: 'Python, FAISS', PROJ1_DATES: '2025',
    PROJ1_BULLET1: 'Built a retrieval system over 40,000 support tickets.',
    PROJ1_BULLET2: 'Raised top-3 accuracy with an embedding re-ranker.',
    PROJ2_NAME: 'Habit Tracker', PROJ2_STACK: 'Node, SQLite', PROJ2_DATES: '2024',
    PROJ2_BULLET1: 'Shipped a small CLI tool used by 20 classmates.',
    SKILLS_LANGUAGES: 'Python, JavaScript, SQL',
    SKILLS_FRAMEWORKS: 'Node.js, React',
    SKILLS_TOOLS: 'Git, Docker',
  };
  let out = template;
  for (const [k, v] of Object.entries(subs)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}
