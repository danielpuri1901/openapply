import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distill, tokensOf, contentWords } from './distill.mjs';

test('tokensOf pulls backticked, camelCase and CONSTANT_CASE terms out of a note', () => {
  const toks = tokensOf('Set `singleValue` then watch FIELD_NOT_COMMITTED fire on ashbyFormField.commit()');
  assert.ok(toks.includes('singleValue'));
  assert.ok(toks.includes('FIELD_NOT_COMMITTED'));
});

test('contentWords drops stopwords', () => {
  const words = contentWords('the field was not committed for this company');
  assert.ok(!words.includes('the'));
  assert.ok(words.includes('field'));
  assert.ok(words.includes('committed'));
});

test('a trap that fired 2+ times and is absent from the docs is reported as owed', () => {
  const rows = [
    { ats: 'ashby', company: 'A', traps: ['FIELD_NOT_COMMITTED'] },
    { ats: 'ashby', company: 'B', traps: ['FIELD_NOT_COMMITTED'] },
  ];
  const { gaps } = distill(rows, '');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].written, false);
});

test('a trap already described in the docs (by content, not exact string) is not owed', () => {
  const rows = [
    { ats: 'ashby', company: 'A', traps: ['COORD_CLICK_NEEDED'] },
    { ats: 'ashby', company: 'B', traps: ['COORD_CLICK_NEEDED'] },
  ];
  const docs = 'A ref click can silently focus a field without typing landing in it, so a coordinate click is sometimes needed.';
  const { gaps } = distill(rows, docs);
  assert.equal(gaps[0].written, true);
});

test('a trap that fired only once is not a gap', () => {
  const rows = [{ ats: 'ashby', company: 'A', traps: ['SLOW_RENDER'] }];
  const { gaps } = distill(rows, '');
  assert.equal(gaps.length, 0);
});

test('a long note with terms missing from the docs is reported unwritten', () => {
  const rows = [{ company: 'A', ats: 'greenhouse', at: '2026-09-24', notes: 'x'.repeat(70) + ' matched `singleValue` on reactSelectWidget' }];
  const { unwritten } = distill(rows, 'nothing relevant here');
  assert.equal(unwritten.length, 1);
  assert.ok(unwritten[0].missing.includes('singleValue'));
});
