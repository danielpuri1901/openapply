import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../discover/db.mjs';
import {
  appendFill, readLog, trapsFor, summarise, leaseKey,
  applicationsFile, readApplicationsFile, recordApplied, readAllApplications, findDiscovered,
} from './log.mjs';

function tmp() { return mkdtempSync(path.join(tmpdir(), 'openapply-log-')); }

test('leaseKey is stable per company+url and normalizes both', () => {
  assert.equal(leaseKey('Acme Inc', 'https://jobs.ashbyhq.com/acme/123?x=1'), leaseKey('acme inc', 'https://jobs.ashbyhq.com/acme/123?y=2'));
});

test('appendFill writes one JSONL row with defaults filled in', () => {
  const file = path.join(tmp(), 'fill-log.jsonl');
  const row = appendFill({ company: 'Acme', url: 'https://x', ats: 'ashby', outcome: 'filled', traps: ['FIELD_NOT_COMMITTED'], turns: 6 }, { file });
  assert.equal(row.company, 'Acme');
  assert.deepEqual(readLog({ file }), [row]);
});

test('trapsFor counts traps scoped to one ATS', () => {
  const file = path.join(tmp(), 'fill-log.jsonl');
  appendFill({ company: 'A', ats: 'ashby', outcome: 'filled', traps: ['FIELD_NOT_COMMITTED', 'FIELDSET_MISSED'] }, { file });
  appendFill({ company: 'B', ats: 'ashby', outcome: 'filled', traps: ['FIELD_NOT_COMMITTED'] }, { file });
  appendFill({ company: 'C', ats: 'greenhouse', outcome: 'filled', traps: ['COMBOBOX_NOT_COMMITTED'] }, { file });
  const traps = trapsFor('ashby', { file });
  assert.deepEqual(traps[0], ['FIELD_NOT_COMMITTED', 2]);
  assert.ok(!traps.some(([code]) => code === 'COMBOBOX_NOT_COMMITTED'));
});

test('summarise computes average turns and outcome counts', () => {
  const file = path.join(tmp(), 'fill-log.jsonl');
  appendFill({ company: 'A', outcome: 'filled', turns: 4 }, { file });
  appendFill({ company: 'B', outcome: 'filled', turns: 8 }, { file });
  appendFill({ company: 'C', outcome: 'blocked' }, { file });
  const s = summarise({ file });
  assert.equal(s.total, 3);
  assert.equal(s.avgTurns, 6);
  assert.equal(s.byOutcome.filled, 2);
  assert.equal(s.byOutcome.blocked, 1);
});

test('recordApplied writes data/applications/<norm(company)>.json in the dedup.mjs shape', () => {
  const dir = tmp();
  const rec = recordApplied('Acme Inc', 'https://jobs.ashbyhq.com/acme/123', { role: 'AI Engineer', ats: 'ashby', appliedAt: '2026-09-24T10:00:00.000Z', dir });
  assert.equal(rec.company, 'Acme Inc');
  assert.equal(rec.ats, 'ashby');
  assert.deepEqual(rec.applications, [{ role: 'AI Engineer', url: 'https://jobs.ashbyhq.com/acme/123', appliedAt: '2026-09-24T10:00:00.000Z' }]);

  const onDisk = readApplicationsFile('Acme Inc', { dir });
  assert.deepEqual(onDisk.applications, rec.applications);
  assert.equal(applicationsFile('Acme Inc', { dir }), applicationsFile('acme inc', { dir }), 'filename keys on the normalized company identity');
});

test('recordApplied updates the same posting instead of duplicating it', () => {
  const dir = tmp();
  recordApplied('Acme', 'https://x/1', { appliedAt: '2026-09-01T00:00:00.000Z', dir });
  const rec = recordApplied('Acme', 'https://x/1', { role: 'Updated Title', appliedAt: '2026-09-02T00:00:00.000Z', dir });
  assert.equal(rec.applications.length, 1);
  assert.equal(rec.applications[0].role, 'Updated Title');
});

test('readAllApplications flattens every company file to one row per posting', () => {
  const dir = tmp();
  recordApplied('Acme', 'https://x/1', { appliedAt: '2026-09-01T00:00:00.000Z', dir });
  recordApplied('Beta Co', 'https://y/1', { appliedAt: '2026-09-02T00:00:00.000Z', dir });
  recordApplied('Beta Co', 'https://y/2', { appliedAt: '2026-09-03T00:00:00.000Z', dir });
  const rows = readAllApplications({ dir });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.company && r.url && r.appliedAt));
});

test('findDiscovered looks up the role_id and ats for a posting url', () => {
  const dbPath = path.join(tmp(), 'openapply.sqlite');
  const db = openDb(dbPath);
  db.prepare(`INSERT INTO discovered (key, company, ats, role_id, url, apply_url, status, first_seen, last_checked)
              VALUES ('acme|ashby|123', 'acme', 'ashby', '123', 'https://jobs.ashbyhq.com/acme/123', NULL, 'open', '2026-09-01', '2026-09-01')`).run();
  const found = findDiscovered(db, 'Acme', 'https://jobs.ashbyhq.com/acme/123');
  assert.equal(found.ats, 'ashby');
  assert.equal(found.role_id, '123');
  assert.equal(findDiscovered(db, 'Acme', 'https://nope'), null);
});
