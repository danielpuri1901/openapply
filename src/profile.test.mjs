import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ROOT, loadProfile, toFilter, toScrape, forbiddenList } from './profile.mjs';

const example = path.join(ROOT, 'profile.example.md');

test('example profile loads with defaults', () => {
  const p = loadProfile(example);
  assert.equal(p.identity.full_name, 'Alex Rivera');
  assert.equal(p.submit.auto_submit_no_essay, false);
  assert.match(p.body, /# About me/);
});

test('scraper and gate read the same geo and title lists', () => {
  const p = loadProfile(example);
  const f = toFilter(p);
  const s = toScrape(p);
  assert.deepEqual(Object.keys(s.geoKeywords), f.geo.tiers.map((t) => t.name));
  assert.deepEqual(s.titleBlock, f.exclude_titles);
});

test('missing required fields are named', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-'));
  const file = path.join(dir, 'profile.md');
  writeFileSync(file, '---\nidentity:\n  full_name: "X"\n---\n');
  assert.throws(() => loadProfile(file), /identity\.email.*location\.current/);
});

test('forbidden list flattens all categories', () => {
  const p = loadProfile(example);
  p.forbidden.names = ['Secret Co'];
  assert.deepEqual(forbiddenList(p), ['Secret Co']);
});
