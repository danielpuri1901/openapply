import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { checkDedup } from './dedup.mjs';

function withHistory(company, applications) {
  const dir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  writeFileSync(path.join(dir, `${company}.json`), JSON.stringify({ company, applications }));
  return dir;
}

test('no history is never blocked', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  const r = checkDedup('Acme', { appsDir: dir, maxApps: 2, windowDays: 7, reapplyGapDays: 60 });
  assert.equal(r.blocked, false);
  assert.equal(r.reason, 'ok');
});

test('company identity is normalized: "Modal Labs" and "modal-labs" read the same file', () => {
  const dir = withHistory('modallabs', [{ role: 'AI Engineer', url: 'https://x/1', appliedAt: new Date().toISOString() }]);
  const r = checkDedup('Modal Labs', { appsDir: dir, maxApps: 2, windowDays: 7, reapplyGapDays: 60 });
  assert.equal(r.priorCount, 1);
});

test('hitting the per-window cap blocks further applications', () => {
  const now = Date.now();
  const dir = withHistory('acme', [
    { role: 'A', appliedAt: new Date(now - 1 * 86400000).toISOString() },
    { role: 'B', appliedAt: new Date(now - 2 * 86400000).toISOString() },
  ]);
  const r = checkDedup('acme', { appsDir: dir, maxApps: 2, windowDays: 7, reapplyGapDays: 60, now });
  assert.equal(r.blocked, true);
  assert.match(r.reason, /^max-2-per-7d$/);
});

test('the reapply gap is scoped to the same role, not the whole company', () => {
  const now = Date.now();
  const dir = withHistory('acme', [{ role: 'Growth Engineer', appliedAt: new Date(now - 5 * 86400000).toISOString() }]);
  const blockedSame = checkDedup('acme', { appsDir: dir, role: 'Growth Engineer', maxApps: 5, windowDays: 1, reapplyGapDays: 60, now });
  assert.equal(blockedSame.blocked, true);
  const okDifferent = checkDedup('acme', { appsDir: dir, role: 'Platform Engineer', maxApps: 5, windowDays: 1, reapplyGapDays: 60, now });
  assert.equal(okDifferent.blocked, false);
});

test('an application older than the gap is not blocked, and reports cooldown', () => {
  const now = Date.now();
  const dir = withHistory('acme', [{ role: 'AI Engineer', appliedAt: new Date(now - 90 * 86400000).toISOString() }]);
  const r = checkDedup('acme', { appsDir: dir, role: 'AI Engineer', maxApps: 5, windowDays: 7, reapplyGapDays: 60, now });
  assert.equal(r.blocked, false);
  assert.equal(r.reason, 'cooldown');
});
