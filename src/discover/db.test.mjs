import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  openDb, norm, slugFromAtsUrl, upsertSweep, markScraped, markApplied, setGate,
  eligibleOpen, upsertCompany, companiesToScrape, boardsOf, ungatedOpen, stats,
} from './db.mjs';

const row = (id, title = 'AI Engineer') => ({ role_id: id, title, loc: 'Lisbon', tier: 'lisbon', url: `https://x/${id}`, applyUrl: `https://x/${id}/apply` });

test('norm strips case and punctuation to one identity', () => {
  assert.equal(norm('Modal Labs'), 'modallabs');
  assert.equal(norm('modal-labs'), 'modallabs');
});

test('slugFromAtsUrl reads the identity out of an ATS URL', () => {
  assert.equal(slugFromAtsUrl('https://jobs.ashbyhq.com/modal/abc-123'), 'modal');
  assert.equal(slugFromAtsUrl('https://example.com/careers'), null);
});

test('upsertSweep: first sight is a baseline, second sight surfaces only genuinely new roles', () => {
  const db = openDb(':memory:');
  const first = upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2')]);
  assert.equal(first.baseline, true);
  assert.equal(first.newRoles.length, 0);

  const second = upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2'), row('3')]);
  assert.equal(second.baseline, false);
  assert.equal(second.newRoles.length, 1);
  assert.equal(second.newRoles[0].role_id, '3');
});

test('upsertSweep closes roles the board no longer lists, and reopens a returning one', () => {
  const db = openDb(':memory:');
  upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2')]);
  const closed = upsertSweep(db, 'Acme', 'ashby', [row('1')]);
  assert.equal(closed.closed, 1);

  const reopened = upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2')]);
  assert.equal(reopened.newRoles.length, 0); // it re-appeared, not "new"
  const r = db.prepare("SELECT status FROM discovered WHERE key = 'acme|ashby|2'").get();
  assert.equal(r.status, 'open');
});

test('markScraped: notFound flags probe, repeated zero-job runs flag probe after 3, ok resets the streak', () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  markScraped(db, 'acme', 'ashby', { notFound: true });
  assert.equal(db.prepare('SELECT status FROM companies').get().status, 'probe');

  upsertCompany(db, { slug: 'beta', ats: 'ashby' });
  markScraped(db, 'beta', 'ashby', { ok: true, jobCount: 0 });
  markScraped(db, 'beta', 'ashby', { ok: true, jobCount: 0 });
  markScraped(db, 'beta', 'ashby', { ok: true, jobCount: 0 });
  assert.equal(db.prepare("SELECT status FROM companies WHERE slug = 'beta'").get().status, 'probe');

  markScraped(db, 'beta', 'ashby', { ok: true, jobCount: 5 });
  const r = db.prepare("SELECT zero_streak FROM companies WHERE slug = 'beta'").get();
  assert.equal(r.zero_streak, 0);
});

test('markApplied takes a role out of the open pool', () => {
  const db = openDb(':memory:');
  upsertSweep(db, 'Acme', 'ashby', [row('1')]);
  setGate(db, 'acme|ashby|1', { eligible: 1, reason: 'ok' });
  assert.equal(eligibleOpen(db).length, 1);
  markApplied(db, 'Acme', 'ashby', '1');
  assert.equal(eligibleOpen(db).length, 0);
});

test('eligibleOpen only returns gated-eligible open roles, joined to the board address', () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby', boardSlug: 'acme-hq' });
  upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2')]);
  setGate(db, 'acme|ashby|1', { eligible: 1, reason: 'ok' });
  setGate(db, 'acme|ashby|2', { eligible: 0, reason: 'geo' });
  const open = eligibleOpen(db);
  assert.equal(open.length, 1);
  assert.equal(open[0].board, 'acme-hq');
});

test('boardsOf falls back to the slug when no board_slug is set', () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  assert.equal(boardsOf(db).get('acme'), 'acme');
});

test('ungatedOpen surfaces roles with no verdict yet', () => {
  const db = openDb(':memory:');
  upsertSweep(db, 'Acme', 'ashby', [row('1')]);
  assert.equal(ungatedOpen(db).length, 1);
  setGate(db, 'acme|ashby|1', { eligible: 1, reason: 'ok' });
  assert.equal(ungatedOpen(db).length, 0);
});

test('companiesToScrape only returns active companies', () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  assert.equal(companiesToScrape(db).length, 1);
});

test('stats reports the funnel', () => {
  const db = openDb(':memory:');
  upsertCompany(db, { slug: 'acme', ats: 'ashby' });
  upsertSweep(db, 'Acme', 'ashby', [row('1'), row('2')]);
  setGate(db, 'acme|ashby|1', { eligible: 1, reason: 'ok' });
  const s = stats(db);
  assert.equal(s.book, 1);
  assert.equal(s.open, 2);
  assert.equal(s.eligible, 1);
  assert.equal(s.gatePending, 1);
});
