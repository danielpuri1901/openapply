import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, loadProfile } from '../profile.mjs';
import { loadAnswers } from '../answers/answers.mjs';
import { latexEscape, letterBody, fillTemplate } from './letter.mjs';

const profile = loadProfile(path.join(ROOT, 'profile.example.md'));
const golden = loadAnswers(path.join(ROOT, 'answers.example')).find((a) => a.id === 'cover-letter');

test('latexEscape protects LaTeX special characters', () => {
  assert.equal(latexEscape('50% & $10_000 #1'), '50\\% \\& \\$10\\_000 \\#1');
});

test('a letter without a hook is refused, never built with a made-up line', () => {
  const { problems } = letterBody(golden.text, { company: 'Acme', role: 'AI Engineer', profile });
  assert.ok(problems.some((p) => /hook missing/.test(p)));
});

test('a letter with a hook fills company, role and hook and passes the humanizer', () => {
  const { body, problems } = letterBody(golden.text, { company: 'Acme', role: 'AI Engineer', hook: 'I read the Acme engineering blog post on their search stack.', profile });
  assert.deepEqual(problems, []);
  assert.doesNotMatch(body, /\{(company|role|hook)\}/);
  assert.match(body, /AI Engineer role at Acme/);
});

test('the template has no tokens left after filling', () => {
  const template = readFileSync(path.join(ROOT, 'cv', 'cover-letter.template.tex'), 'utf8');
  const tex = fillTemplate(template, { profile, company: 'Acme', body: 'Hello.\n\nSecond.', city: 'Berlin, Germany', date: '1 October 2026' });
  assert.doesNotMatch(tex, /\{\{[A-Z_]+\}\}/);
  assert.match(tex, /relocating to Berlin/);
});
