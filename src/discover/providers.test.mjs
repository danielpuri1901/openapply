import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ashby from './providers/ashby.mjs';
import * as greenhouse from './providers/greenhouse.mjs';
import * as lever from './providers/lever.mjs';

test('ashby: workplaceType wins over isRemote, and onSiteStated needs a clean signal', () => {
  const json = {
    jobs: [
      { id: '1', title: 'Hybrid Role', jobUrl: 'https://jobs.ashbyhq.com/acme/1', location: 'NYC', workplaceType: 'Hybrid', isRemote: true },
      { id: '2', title: 'Remote Role', jobUrl: 'https://jobs.ashbyhq.com/acme/2', location: 'Anywhere', workplaceType: 'Remote' },
      { id: '3', title: 'Office Role, comfortable fully remote culture', jobUrl: 'https://jobs.ashbyhq.com/acme/3', location: 'SF Office', workplaceType: 'OnSite' },
    ],
  };
  const rows = ashby.parseBoard(json, 'acme');
  assert.equal(rows[0].remote, false);
  assert.equal(rows[0].onSiteStated, true);
  assert.equal(rows[1].remote, true);
  assert.equal(rows[2].onSiteStated, false); // title itself mentions remote
});

test('greenhouse: remote only when text says remote AND names no concrete office', () => {
  const json = {
    jobs: [
      { id: 1, title: 'A', absolute_url: 'https://x/1', location: { name: 'Remote' } },
      { id: 2, title: 'B', absolute_url: 'https://x/2', location: { name: 'Remote-Friendly, United States; New York City, NY' } },
    ],
  };
  const rows = greenhouse.parseBoard(json, 'acme');
  assert.equal(rows[0].remote, true);
  assert.equal(rows[1].remote, false);
});

test('lever: remote from workplaceType or a remote location category', () => {
  const json = [
    { id: '1', text: 'A', hostedUrl: 'https://jobs.lever.co/acme/1', workplaceType: 'remote', categories: {} },
    { id: '2', text: 'B', hostedUrl: 'https://jobs.lever.co/acme/2', categories: { location: 'Remote - US' } },
  ];
  const rows = lever.parseBoard(json, 'acme');
  assert.equal(rows[0].remote, true);
  assert.equal(rows[1].remote, true);
  assert.equal(rows[0].applyUrl, 'https://jobs.lever.co/acme/1/apply');
});
