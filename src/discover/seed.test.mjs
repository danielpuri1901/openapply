import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ROOT } from '../profile.mjs';
import { openDb, companiesToScrape } from './db.mjs';
import { parseSeed, seed } from './seed.mjs';

test('parseSeed keeps supported ATS lines and skips comments and unknown ATS', () => {
  const boards = parseSeed('# c\nashby acme\n\ngreenhouse beta\nworkday gamma\nlever\n');
  assert.deepEqual(boards, [{ ats: 'ashby', slug: 'acme' }, { ats: 'greenhouse', slug: 'beta' }]);
});

test('seed is idempotent and the shipped list loads', () => {
  const db = openDb(path.join(mkdtempSync(path.join(tmpdir(), 'seed-')), 't.sqlite'));
  const boards = parseSeed(readFileSync(path.join(ROOT, 'seeds', 'boards.txt'), 'utf8'));
  assert.ok(boards.length > 100);
  assert.equal(seed(db, boards), boards.length);
  assert.equal(seed(db, boards), 0);
  assert.equal(companiesToScrape(db).length, boards.length);
});
