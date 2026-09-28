import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadProfile } from '../profile.mjs';
import { verify } from './verify.mjs';

const profile = loadProfile(path.join(ROOT, 'profile.example.md'));

function baseDump(overrides = {}) {
  return {
    url: '/apply',
    city: 'New York, United States',
    fields: [
      { kind: 'text', label: 'Full name', value: profile.identity.full_name, required: true },
      { kind: 'email', label: 'Email', value: profile.identity.email, required: true },
      { kind: 'file', label: 'Resume', value: 'resume.pdf', required: true },
    ],
    choices: [],
    ...overrides,
  };
}

test('an empty dump is a FAIL, not a false PASS', () => {
  const r = verify({ fields: [], choices: [] }, { profile });
  assert.equal(r.ok, false);
  assert.match(r.blocks[0], /not on the page/);
});

test('name mismatch blocks', () => {
  const dump = baseDump();
  dump.fields[0].value = 'Someone Else';
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => b.includes('Name is')));
});

test('empty resume field blocks', () => {
  const dump = baseDump();
  dump.fields[2].value = '';
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => /resume/i.test(b)));
});

test('required and unanswered choice blocks; optional flags', () => {
  const dump = baseDump({
    choices: [
      { kind: 'yesno-button', question: 'Willing to relocate?', selected: [], required: true },
      { kind: 'yesno-button', question: 'Optional thing?', selected: [], required: false },
    ],
  });
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => /REQUIRED and unanswered/.test(b)));
  assert.ok(r.flags.some((f) => /unanswered \(optional\)/.test(f)));
});

test('sponsorship polarity: wrong answer blocks, right answer passes (US region needs sponsorship)', () => {
  const wrong = baseDump({ choices: [{ kind: 'yesno-button', question: 'Will you now or in the future require sponsorship?', selected: ['No'], required: true }] });
  const r1 = verify(wrong, { profile });
  assert.equal(r1.ok, false);
  assert.ok(r1.blocks.some((b) => b.includes('POLARITY')));

  const right = baseDump({ choices: [{ kind: 'yesno-button', question: 'Will you now or in the future require sponsorship?', selected: ['Yes'], required: true }] });
  const r2 = verify(right, { profile });
  assert.equal(r2.ok, true);
});

test('a residency question is flagged, never auto-answered', () => {
  const dump = baseDump({ choices: [{ kind: 'radio', question: 'Are you currently based in New York?', selected: ['Yes'], required: true }] });
  const r = verify(dump, { profile });
  assert.equal(r.ok, true);
  assert.ok(r.flags.some((f) => f.includes('human judgment')));
});

test('a consent/certify question is flagged, never auto-answered', () => {
  const dump = baseDump({ choices: [{ kind: 'checkbox', question: 'I certify the above is true', selected: [], required: true }] });
  const r = verify(dump, { profile });
  assert.equal(r.ok, true);
  assert.ok(r.flags.some((f) => f.includes('human judgment')));
});

test('forbidden-fact hits reported by the browser become blocks', () => {
  const dump = baseDump({
    fields: [
      ...baseDump().fields,
      { kind: 'textarea', label: 'Why us', length: 400, hits: ['forbidden:Secret Co'] },
    ],
  });
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => b.includes('Secret Co')));
});

test('em dash and curly quotes block on raw free text', () => {
  const longText = 'x'.repeat(130) + ' — dash';
  const dump = baseDump({ fields: [...baseDump().fields, { kind: 'textarea', label: 'Essay', value: longText }] });
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => /em or en dash/.test(b)));
});

test('a clean fill passes', () => {
  const dump = baseDump({
    choices: [
      { kind: 'yesno-button', question: 'Will you now or in the future require sponsorship?', selected: ['Yes'], required: true },
      { kind: 'yesno-button', question: 'Are you willing to relocate?', selected: [profile.location.willing_to_relocate ? 'Yes' : 'No'], required: true },
    ],
  });
  const r = verify(dump, { profile });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blocks, []);
});
