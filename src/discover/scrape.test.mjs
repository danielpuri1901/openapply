import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrape } from './scrape.mjs';
import { openDb, upsertCompany, eligibleOpen } from './db.mjs';

const cfg = { titleKeywords: ['engineer'], titleBlock: ['senior'], geoKeywords: { lisbon: ['lisbon'] }, remoteOk: true };

test('a healthy board is diffed, prefiltered, and its new roles surfaced', async () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  const probe = async () => [
    { title: 'Software Engineer', loc: 'Lisbon, Portugal', url: 'https://x/1', applyUrl: 'https://x/1/a', remote: false },
    { title: 'Senior Engineer', loc: 'Lisbon, Portugal', url: 'https://x/2', applyUrl: 'https://x/2/a', remote: false }, // title-blocked
    { title: 'Engineer', loc: 'Bangalore', url: 'https://x/3', applyUrl: 'https://x/3/a', remote: false }, // out of geo
  ];
  const r = await scrape(db, cfg, { probe });
  assert.equal(r.scraped, 1);
  // First sight of the company is a baseline: nothing surfaces as NEW.
  assert.equal(r.newRoles.length, 0);
});

test('remote roles are trusted over location text when the profile allows remote', async () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  const probe = async () => [{ title: 'Software Engineer', loc: 'Anywhere', url: 'https://x/1', applyUrl: 'https://x/1/a', remote: true }];
  await scrape(db, cfg, { probe });
  const row = db.prepare("SELECT tier FROM discovered WHERE key = 'acme|ashby|1'").get();
  assert.equal(row.tier, 'remote');
});

test('a 404 flags the company for probe and never touches its roles', async () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  const probe = async () => { throw new Error('404 Not Found'); };
  const r = await scrape(db, cfg, { probe });
  assert.equal(r.probed.length, 1);
  assert.equal(db.prepare('SELECT status FROM companies').get().status, 'probe');
});

test('a marketplace board is swept empty and retired', async () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'agency', ats: 'ashby' });
  const probe = async () => Array.from({ length: 6 }, (_, i) => ({
    title: 'Founding Engineer', loc: 'Remote', url: `https://x/${i}`, applyUrl: `https://x/${i}/a`, remote: true,
  }));
  const r = await scrape(db, cfg, { probe });
  assert.equal(r.marketplaces.length, 1);
  assert.equal(db.prepare('SELECT status FROM companies').get().status, 'marketplace');
});

test('gate verdicts land on the role, and a throwing gate leaves it pending', async () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  const probe = async () => [{ title: 'Engineer', loc: 'Lisbon', url: 'https://x/1', applyUrl: 'https://x/1/a', remote: false }];
  const gate = async () => ({ eligible: 1, reason: 'ok' });
  await scrape(db, cfg, { probe, gate });
  assert.equal(eligibleOpen(db).length, 1);

  const db2 = openDb(':memory:');
  upsertCompany(db2, { slug: 'acme', ats: 'ashby' });
  const throwingGate = async () => { throw new Error('JD fetch failed'); };
  const r2 = await scrape(db2, cfg, { probe, gate: throwingGate });
  assert.equal(r2.gatePending, 1);
  const row = db2.prepare("SELECT gate_reason FROM discovered WHERE key = 'acme|ashby|1'").get();
  assert.equal(row.gate_reason, 'gate_pending');
});
