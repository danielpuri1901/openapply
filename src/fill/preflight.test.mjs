import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { recordApplied, leaseKey } from '../record/log.mjs';
import { preflight, detectAts } from './preflight.mjs';

function tmpDir() { return mkdtempSync(path.join(tmpdir(), 'openapply-preflight-')); }

function profile(overrides = {}) {
  return {
    limits: {
      max_apps_per_company: 2, window_days: 90, reapply_gap_days: 14,
      blocked_companies: [], company_rules: {}, ...overrides,
    },
  };
}

function fakeClaim(held = new Set()) {
  return (key) => (held.has(key) ? { claimed: false, reason: 'claimed' } : (held.add(key), { claimed: true }));
}

test('detectAts recognizes the three encoded platforms and nothing else', () => {
  assert.equal(detectAts('https://jobs.ashbyhq.com/acme/1'), 'ashby');
  assert.equal(detectAts('https://boards.greenhouse.io/acme/1'), 'greenhouse');
  assert.equal(detectAts('https://jobs.lever.co/acme/1'), 'lever');
  assert.equal(detectAts('https://acme.example.com/careers/1'), null);
});

test('a blocked company always REFUSEs, before any lease is touched', () => {
  const r = preflight('Current Employer', 'https://x', {
    profile: profile({ blocked_companies: ['Current Employer'] }),
    appsDir: tmpDir(),
    claim: fakeClaim(),
  });
  assert.equal(r.go, false);
  assert.equal(r.reason, 'blocked-company');
});

test('a company with no history GOes and claims the lease', () => {
  const r = preflight('Acme', 'https://jobs.ashbyhq.com/acme/1', { profile: profile(), appsDir: tmpDir(), claim: fakeClaim() });
  assert.equal(r.go, true);
  assert.equal(r.cooldown, null);
});

test('at cap within the window REFUSEs', () => {
  const dir = tmpDir();
  const now = Date.now();
  recordApplied('Acme', 'https://x/1', { appliedAt: new Date(now - 1 * 86400000).toISOString(), dir });
  recordApplied('Acme', 'https://x/2', { appliedAt: new Date(now - 2 * 86400000).toISOString(), dir });
  const r = preflight('Acme', 'https://x/3', { now, profile: profile({ max_apps_per_company: 2, window_days: 90 }), appsDir: dir, claim: fakeClaim() });
  assert.equal(r.go, false);
  assert.match(r.reason, /max-2-per-90d/);
});

test('a company-specific rule overrides the default cap', () => {
  const dir = tmpDir();
  const now = Date.now();
  recordApplied('Strict Co', 'https://x/1', { appliedAt: new Date(now - 1 * 86400000).toISOString(), dir });
  const r = preflight('Strict Co', 'https://x/2', {
    now, appsDir: dir, claim: fakeClaim(),
    profile: profile({ company_rules: { 'Strict Co': { max_apps: 1, window_days: 90 } } }),
  });
  assert.equal(r.go, false);
});

test('one prior application past the reapply gap is a WARN (cooldown), not a REFUSE', () => {
  const dir = tmpDir();
  const now = Date.now();
  // reapply_gap_days defaults to 14; 20 days ago clears the gap but the
  // company is still under its 90-day cap, so this is informational only.
  recordApplied('Acme', 'https://x/1', { appliedAt: new Date(now - 20 * 86400000).toISOString(), dir });
  const r = preflight('Acme', 'https://x/2', { now, profile: profile(), appsDir: dir, claim: fakeClaim() });
  assert.equal(r.go, true);
  assert.equal(r.cooldown, 20);
});

test('one prior application inside the reapply gap REFUSEs', () => {
  const dir = tmpDir();
  const now = Date.now();
  recordApplied('Acme', 'https://x/1', { appliedAt: new Date(now - 5 * 86400000).toISOString(), dir });
  const r = preflight('Acme', 'https://x/2', { now, profile: profile(), appsDir: dir, claim: fakeClaim() });
  assert.equal(r.go, false);
  assert.match(r.reason, /reapply-gap-14d/);
});

test('a held lease REFUSEs even when dedup is clear', () => {
  const held = new Set([leaseKey('Acme', 'https://jobs.ashbyhq.com/acme/1')]);
  const r = preflight('Acme', 'https://jobs.ashbyhq.com/acme/1', { profile: profile(), appsDir: tmpDir(), claim: fakeClaim(held) });
  assert.equal(r.go, false);
  assert.match(r.reason, /lease-held/);
});
