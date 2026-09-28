import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { claim, release, due, LEASE_MS } from './leases.mjs';

function tmpFile() { return path.join(mkdtempSync(path.join(tmpdir(), 'openapply-leases-')), 'leases.json'); }

test('a fresh key is due and claimable', () => {
  const file = tmpFile();
  assert.equal(due('k', { file }), true);
  assert.deepEqual(claim('k', { file }), { claimed: true });
});

test('a live claim blocks a second claim', () => {
  const file = tmpFile();
  claim('k', { file, now: 1000 });
  assert.equal(due('k', { file, now: 1000 + 1000 }), false);
  assert.deepEqual(claim('k', { file, now: 1000 + 1000 }), { claimed: false, reason: 'claimed' });
});

test('a claim past the lease window is due again (crashed run)', () => {
  const file = tmpFile();
  claim('k', { file, now: 0 });
  assert.equal(due('k', { file, now: LEASE_MS + 1 }), true);
  assert.deepEqual(claim('k', { file, now: LEASE_MS + 1 }), { claimed: true });
});

test('a failed release makes the key due again immediately', () => {
  const file = tmpFile();
  claim('k', { file, now: 0 });
  release('k', 'failed', { file, now: 10 });
  assert.equal(due('k', { file, now: 20 }), true);
});

test('a delivered release is never due again', () => {
  const file = tmpFile();
  claim('k', { file, now: 0 });
  release('k', 'delivered', { file, now: 10 });
  assert.equal(due('k', { file, now: LEASE_MS * 10 }), false);
});
