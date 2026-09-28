// leases.mjs - a lock with a time limit, claimed before the side-effecting
// action (opening a browser tab), so a crashed run and a live run can never
// both act on the same posting. Advisory-only dedup gets skipped; a lease
// enforced in code cannot be.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../profile.mjs';

export const LEASE_MS = 20 * 60 * 1000;
export const LEASES_FILE = path.join(ROOT, 'data', 'leases.json');

function read(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

function write(file, state) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}

// due = safe to claim: no record, a crashed claim past the lease window, or a
// previously failed or released attempt. A live claim or a delivered result is never due.
export function due(key, { file = LEASES_FILE, now = Date.now() } = {}) {
  const rec = read(file)[key];
  if (!rec) return true;
  if (rec.status === 'claimed' && now - rec.at > LEASE_MS) return true;
  if (rec.status === 'failed' || rec.status === 'released') return true;
  return false;
}

export function claim(key, { file = LEASES_FILE, now = Date.now() } = {}) {
  const state = read(file);
  if (!due(key, { file, now })) return { claimed: false, reason: state[key]?.status };
  state[key] = { status: 'claimed', at: now };
  write(file, state);
  return { claimed: true };
}

export function release(key, status, { file = LEASES_FILE, now = Date.now() } = {}) {
  const state = read(file);
  state[key] = { status, at: now };
  write(file, state);
}
