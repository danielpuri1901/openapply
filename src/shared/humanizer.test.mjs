import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, neverWords, DEFAULT_AI_VOCAB } from './humanizer.mjs';

test('clean text passes with no violations', () => {
  assert.deepEqual(check('I built a tool that cut report time from two days to two hours.'), []);
});

test('flags an em dash', () => {
  const violations = check('This is a fix — not a workaround.');
  assert.ok(violations.some((v) => v.rule === 'em_dash' && v.count === 1));
});

test('flags AI-vocabulary words, case-insensitive, word-boundary', () => {
  const violations = check('I want to leverage this experience.');
  const hit = violations.find((v) => v.rule === 'ai_vocab' && v.word === 'leverage');
  assert.ok(hit);
  assert.equal(hit.count, 1);
  // "leverages" is a different word and must not match \bleverage\b twice.
  assert.deepEqual(check('leverages'), []);
});

test('flags a rule-of-three list', () => {
  const violations = check('The product is fast, cheap, and reliable.');
  assert.ok(violations.some((v) => v.rule === 'rule_of_three'));
});

test('flags a forbidden fact', () => {
  const violations = check('I worked at Secret Employer for three years.', { forbidden: ['Secret Employer'] });
  assert.ok(violations.some((v) => v.rule === 'forbidden_fact' && v.fact === 'Secret Employer'));
});

test('neverWords parses the Voice "Never:" line', () => {
  const body = '# Voice\n\n- Plain words, short sentences.\n- Never: "passionate", "leverage", "synergy".\n';
  assert.deepEqual(neverWords(body), ['passionate', 'leverage', 'synergy']);
});

test('neverWords returns empty list with no Never line', () => {
  assert.deepEqual(neverWords('# Voice\n\nJust write plainly.'), []);
});

test('DEFAULT_AI_VOCAB matches the CLAUDE.md denylist', () => {
  for (const word of ['delve', 'leverage', 'unleash', 'tapestry', 'journey', 'realm', 'elevate', 'commitment', 'tackle']) {
    assert.ok(DEFAULT_AI_VOCAB.includes(word), `missing ${word}`);
  }
});
