import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../discover/db.mjs';
import { recordApplied, appendFill } from './log.mjs';
import { status } from './status.mjs';

function tmp() { return mkdtempSync(path.join(tmpdir(), 'openapply-status-')); }

test('status reads book/eligible from SQLite and degrades cleanly with no pool.json', () => {
  const dir = tmp();
  const dbPath = path.join(dir, 'openapply.sqlite');
  const db = openDb(dbPath);
  db.prepare("INSERT INTO companies (slug, ats, status, added_at) VALUES ('acme', 'ashby', 'active', '2026-09-01')").run();
  db.prepare(`INSERT INTO discovered (key, company, ats, role_id, status, eligible, first_seen, last_checked)
              VALUES ('acme|ashby|1', 'acme', 'ashby', '1', 'open', 1, '2026-09-01', '2026-09-01')`).run();

  const appsDir = path.join(dir, 'applications');
  const logFile = path.join(dir, 'fill-log.jsonl');
  const s = status({ dbPath, appsDir, logFile, poolFile: path.join(dir, 'no-pool.json') });

  assert.equal(s.book, 1);
  assert.equal(s.eligible, 1);
  assert.equal(s.pool, null);
  assert.equal(s.appliedTotal, 0);
});

test('status counts filled from the fill log and applied from application history', () => {
  const dir = tmp();
  const dbPath = path.join(dir, 'openapply.sqlite');
  openDb(dbPath); // creates an empty, valid store

  const appsDir = path.join(dir, 'applications');
  const logFile = path.join(dir, 'fill-log.jsonl');
  const poolFile = path.join(dir, 'output', 'pool.json');
  mkdirSync(path.dirname(poolFile), { recursive: true });
  writeFileSync(poolFile, JSON.stringify([{ company: 'Acme' }, { company: 'Beta' }]));

  appendFill({ company: 'Acme', outcome: 'filled', turns: 5 }, { file: logFile });
  appendFill({ company: 'Beta', outcome: 'blocked' }, { file: logFile });
  recordApplied('Acme', 'https://x/1', { appliedAt: new Date().toISOString(), dir: appsDir });

  const s = status({ dbPath, appsDir, logFile, poolFile });
  assert.equal(s.pool, 2);
  assert.equal(s.filled, 1);
  assert.equal(s.appliedTotal, 1);
  assert.equal(s.appliedToday, 1);
});
