import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { makeGate } from './gate.mjs';

const filter = {
  geo: { tiers: [{ name: 'lisbon', keywords: ['lisbon'] }], block: [], always_allow: ['remote'] },
  yoe_ceiling: 3,
  exclude_titles: ['solutions engineer', 'senior'],
  blocked_companies: ['currentemployer'],
  max_apps_per_company: 2,
  max_apps_window_days: 7,
  reapply_gap_days: 60,
};

function role(overrides = {}) {
  return { key: 'acme|ashby|1', company: 'Acme', ats: 'ashby', role_id: '1', title: 'AI Engineer', loc: 'Lisbon', board: 'acme', ...overrides };
}

test('a blocked company is rejected without any JD fetch', async () => {
  const appsDir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  const gate = makeGate({ filter, appsDir, fetchJd: async () => { throw new Error('should not fetch'); } });
  const v = await gate(role({ company: 'CurrentEmployer' }));
  assert.deepEqual(v, { eligible: 0, reason: 'company-blocked' });
});

test('an excluded title is rejected before the JD fetch (no network cost)', async () => {
  const appsDir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  let fetched = false;
  const gate = makeGate({ filter, appsDir, fetchJd: async () => { fetched = true; return { text: '', remote: false }; } });
  const v = await gate(role({ title: 'Senior AI Engineer' }));
  assert.equal(v.eligible, 0);
  assert.equal(v.reason, 'excluded-title');
  assert.equal(fetched, false);
});

test('an eligible role passes geo and yoe from the fetched JD', async () => {
  const appsDir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  const gate = makeGate({ filter, appsDir, fetchJd: async () => ({ text: 'Great team in Lisbon.', remote: false }) });
  const v = await gate(role());
  assert.equal(v.eligible, 1);
  assert.equal(v.reason, 'ok');
});

test('a JD demanding too many years is rejected', async () => {
  const appsDir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  const gate = makeGate({ filter, appsDir, fetchJd: async () => ({ text: 'Requires 6+ years of experience.', remote: false }) });
  const v = await gate(role());
  assert.equal(v.eligible, 0);
  assert.equal(v.reason, 'yoe');
});

test('a throwing JD fetch propagates so the caller can leave the role pending', async () => {
  const appsDir = mkdtempSync(path.join(tmpdir(), 'apps-'));
  const gate = makeGate({ filter, appsDir, fetchJd: async () => { throw new Error('network'); } });
  await assert.rejects(() => gate(role()));
});
