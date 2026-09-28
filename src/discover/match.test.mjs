import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordMatch, geoTier, titleOk } from './match.mjs';

test('wordMatch does not match a substring inside another word', () => {
  // Real bug: geo keyword "us" matched inside "Belarus" without a word boundary.
  assert.equal(wordMatch('Remote, Belarus', 'us'), false);
  assert.equal(wordMatch('Austin, Texas', 'us'), false);
  assert.equal(wordMatch('Remote, US', 'us'), true);
});

test('wordMatch handles multi-word keywords', () => {
  assert.equal(wordMatch('New York City, NY', 'new york'), true);
  assert.equal(wordMatch('Newark, NJ', 'new york'), false);
});

test('geoTier returns the first tier whose keywords match', () => {
  const tiers = { lisbon: ['lisbon', 'portugal'], us: ['us', 'usa'] };
  assert.equal(geoTier('Lisbon, Portugal', tiers), 'lisbon');
  assert.equal(geoTier('Remote, Belarus', tiers), null);
  assert.equal(geoTier('', tiers), null);
});

test('titleOk requires a wanted keyword and rejects a blocked one', () => {
  const wanted = ['software engineer', 'ai engineer'];
  const blocked = ['senior', 'solutions engineer'];
  assert.equal(titleOk('Software Engineer', wanted, blocked), true);
  assert.equal(titleOk('Senior Software Engineer', wanted, blocked), false);
  assert.equal(titleOk('Solutions Engineer', wanted, blocked), false);
  assert.equal(titleOk('Product Manager', wanted, blocked), false);
});
