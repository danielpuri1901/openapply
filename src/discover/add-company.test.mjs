import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCompany } from './add-company.mjs';
import { openDb, companiesToScrape } from './db.mjs';

test('a direct ATS board URL is added without a careers-page fetch', async () => {
  const db = openDb(':memory:');
  const r = await addCompany('https://jobs.ashbyhq.com/acme', {
    db,
    fetchText: async () => { throw new Error('should not fetch a careers page'); },
    fetchJson: async () => ({ jobs: [{ id: '1', title: 'AI Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/1' }] }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.ats, 'ashby');
  assert.equal(r.slug, 'acme');
  assert.equal(companiesToScrape(db).length, 1);
});

test('a careers page is resolved, then verified with a real API call', async () => {
  const db = openDb(':memory:');
  const r = await addCompany('acme.com', {
    db,
    fetchText: async () => '<a href="https://jobs.lever.co/acme">careers</a>',
    fetchJson: async () => [{ id: '1', text: 'A', hostedUrl: 'https://jobs.lever.co/acme/1' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.ats, 'lever');
});

test('a resolved board that 404s is not added to the book', async () => {
  const db = openDb(':memory:');
  const r = await addCompany('https://jobs.ashbyhq.com/ghost', {
    db,
    fetchJson: async () => { throw new Error('404 not found'); },
  });
  assert.equal(r.ok, false);
  assert.equal(companiesToScrape(db).length, 0);
});

test('no ATS link found on the page reports failure without guessing', async () => {
  const db = openDb(':memory:');
  const r = await addCompany('nolink.com', { db, fetchText: async () => '<p>no jobs here</p>' });
  assert.equal(r.ok, false);
});
