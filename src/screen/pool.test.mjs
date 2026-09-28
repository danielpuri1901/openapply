import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRoles, capPerCompany, buildPool } from './pool.mjs';
import { openDb, upsertCompany, upsertSweep, setGate } from '../discover/db.mjs';

test('dedupeRoles drops the same company + title seen under two board slugs', () => {
  const roles = [
    { company: 'acme', title: 'AI Engineer', board: 'acme' },
    { company: 'Acme', title: 'AI Engineer', board: 'acme-hq' }, // same identity, same role, different casing/board
    { company: 'acme', title: 'Platform Engineer', board: 'acme' },
  ];
  const out = dedupeRoles(roles);
  assert.equal(out.length, 2);
});

test('capPerCompany limits how many roles from one company pass through', () => {
  const roles = [{ company: 'acme' }, { company: 'acme' }, { company: 'acme' }, { company: 'beta' }];
  const out = capPerCompany(roles, 2);
  assert.equal(out.filter((r) => r.company === 'acme').length, 2);
  assert.equal(out.filter((r) => r.company === 'beta').length, 1);
});

function seeded() {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  upsertSweep(db, 'Acme', 'ashby', [
    { role_id: '1', title: 'AI Engineer', loc: 'Lisbon', tier: 'lisbon', url: 'https://x/1', applyUrl: 'https://x/1/a' },
    { role_id: '2', title: 'Platform Engineer', loc: 'Lisbon', tier: 'lisbon', url: 'https://x/2', applyUrl: 'https://x/2/a' },
  ]);
  setGate(db, 'acme|ashby|1', { eligible: 1, reason: 'ok' });
  setGate(db, 'acme|ashby|2', { eligible: 1, reason: 'ok' });
  return db;
}

test('buildPool screens each eligible role and writes the funnel counts', async () => {
  const db = seeded();
  const screen = async (ats, board, jobId) => ({ lane: jobId === '1' ? 'no-essay' : 'essay', reasons: [] });
  const r = await buildPool(db, { max_apps_per_company: 2 }, { screen });
  assert.equal(r.eligible, 2);
  assert.equal(r.screened, 2);
  assert.equal(r.noEssay, 1);
  assert.equal(r.essay, 1);
});

test('buildPool respects --limit by screening only the first N roles', async () => {
  const db = seeded();
  let calls = 0;
  const screen = async () => { calls++; return { lane: 'no-essay', reasons: [] }; };
  const r = await buildPool(db, { max_apps_per_company: 2 }, { screen, limit: 1 });
  assert.equal(r.screened, 1);
  assert.equal(calls, 1);
});

test('a pre-screen failure lands the role in the essay lane with the error as reason', async () => {
  const db = seeded();
  const screen = async () => { throw new Error('timeout'); };
  const r = await buildPool(db, { max_apps_per_company: 2 }, { screen });
  assert.equal(r.picks.every((p) => p.lane === 'essay'), true);
  assert.match(r.picks[0].reason, /timeout/);
});
