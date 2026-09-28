import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeBoard, fetchJd } from './ats.mjs';

const fixture = {
  jobs: [
    { id: '1', title: 'AI Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/1', location: 'Lisbon', workplaceType: 'OnSite', descriptionPlain: 'Build things.' },
  ],
};

test('probeBoard normalizes a provider response with an injected fetchJson', async () => {
  const rows = await probeBoard('ashby', 'acme', { fetchJson: async () => fixture });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'AI Engineer');
  assert.equal(rows[0].ats, 'ashby');
});

test('fetchJd finds the matching posting by id and returns its text', async () => {
  const jd = await fetchJd('ashby', 'acme', '1', { fetchJson: async () => fixture });
  assert.equal(jd.text, 'Build things.');
  assert.equal(jd.onSiteStated, true);
});

test('fetchJd throws when the job is not on the board', async () => {
  await assert.rejects(() => fetchJd('ashby', 'acme', 'missing', { fetchJson: async () => fixture }));
});

test('probeBoard rejects an unknown ats', async () => {
  await assert.rejects(() => probeBoard('workday', 'acme'));
});
