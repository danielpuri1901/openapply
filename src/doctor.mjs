#!/usr/bin/env node
// doctor.mjs - one command that says what is missing before a first run.
// Exit 0 when everything required is present; optional tools only warn.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadProfile } from './profile.mjs';

const has = (cmd) => {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
};

const [major, minor] = process.versions.node.split('.').map(Number);
const checks = [
  { name: 'Node.js 22.5 or later', ok: major > 22 || (major === 22 && minor >= 5), required: true, fix: 'Install Node 22.5+ from https://nodejs.org' },
  { name: 'dependencies installed', ok: existsSync(path.join(ROOT, 'node_modules', 'js-yaml')), required: true, fix: 'Run npm install' },
  { name: 'LaTeX engine (tectonic or pdflatex)', ok: has('tectonic') || has('pdflatex'), required: true, fix: 'macOS: brew install tectonic. Linux: see https://tectonic-typesetting.github.io' },
  { name: 'pdftotext (CV check)', ok: has('pdftotext'), required: false, fix: 'macOS: brew install poppler. Linux: apt install poppler-utils' },
];

let profileNote = 'no profile.md yet: tell your agent "read AGENTS.md" to start onboarding';
let profileOk = false;
try {
  const p = loadProfile();
  profileOk = true;
  profileNote = `profile.md loads (${p.identity.full_name})`;
} catch (e) {
  if (existsSync(path.join(ROOT, 'profile.md'))) profileNote = `profile.md has a problem: ${e.message}`;
}

let failed = 0;
for (const c of checks) {
  const mark = c.ok ? 'ok  ' : (c.required ? 'FAIL' : 'warn');
  if (!c.ok && c.required) failed++;
  console.log(`${mark} ${c.name}${c.ok ? '' : `  ->  ${c.fix}`}`);
}
console.log(`${profileOk ? 'ok  ' : 'todo'} ${profileNote}`);
console.log('todo confirm the Claude in Chrome extension is installed and connected (the agent checks this with list_connected_browsers)');
process.exit(failed ? 1 : 0);
