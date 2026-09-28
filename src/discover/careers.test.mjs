import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAts, pickBoard, slugPlausible, resolveFromCareers } from './careers.mjs';

test('extractAts finds an Ashby board link in plain HTML', () => {
  const html = '<a href="https://jobs.ashbyhq.com/acme">Careers</a>';
  const hits = extractAts(html);
  assert.deepEqual(hits[0], { ats: 'ashby', slug: 'acme', count: 1 });
});

test('extractAts finds a Greenhouse embed by its for= parameter', () => {
  const html = '<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>';
  const hits = extractAts(html);
  assert.equal(hits[0].ats, 'greenhouse');
  assert.equal(hits[0].slug, 'acme');
});

test('extractAts drops ATS chrome slugs like "embed"', () => {
  const html = '<a href="https://boards.greenhouse.io/embed/job_board">x</a>';
  assert.deepEqual(extractAts(html), []);
});

test('pickBoard refuses to guess across many distinct boards (aggregator)', () => {
  const hits = [1, 2, 3, 4].map((n) => ({ ats: 'ashby', slug: `co${n}`, count: 1 }));
  const picked = pickBoard(hits);
  assert.equal(picked.ats, null);
  assert.match(picked.reason, /aggregator/);
});

test('pickBoard picks the most-referenced board within the limit', () => {
  const hits = [{ ats: 'ashby', slug: 'acme', count: 5 }, { ats: 'lever', slug: 'other', count: 1 }];
  assert.deepEqual(pickBoard(hits), { ats: 'ashby', slug: 'acme', reason: 'referenced 5x' });
});

test('slugPlausible accepts a slug that echoes the company or domain', () => {
  assert.equal(slugPlausible('acme', { company: 'Acme Inc', domain: 'acme.com' }), true);
  assert.equal(slugPlausible('acme-labs', { company: 'Acme', domain: 'acme.com' }), true);
});

test('slugPlausible rejects an unrelated investor board', () => {
  assert.equal(slugPlausible('pear-vc', { company: 'Spurtest', domain: 'spurtest.com' }), false);
});

test('resolveFromCareers picks the own board over a more-referenced investor board', async () => {
  const html = `
    <a href="https://jobs.ashbyhq.com/pear-vc">investor portfolio</a>
    <a href="https://jobs.ashbyhq.com/pear-vc">investor portfolio</a>
    <a href="https://jobs.lever.co/acme">our careers</a>`;
  const r = await resolveFromCareers('acme.com', { company: 'acme', fetchText: async () => html });
  assert.equal(r.ats, 'lever');
  assert.equal(r.slug, 'acme');
});

test('resolveFromCareers reports an unreachable domain without guessing', async () => {
  const r = await resolveFromCareers('dead.example', { fetchText: async () => null });
  assert.equal(r.ats, null);
  assert.equal(r.reason, 'domain unreachable');
});
