#!/usr/bin/env node
// snippet.mjs - prints a self-contained JS function to paste into javascript_tool.
// Every command shares one shape: `(async (FACTS) => {...})(<json>)`. FACTS is
// the profile, inlined as a literal, because Ashby's CSP blocks eval and this
// way nothing is ever pulled from localStorage or a network call at fill time.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadProfile } from '../profile.mjs';
import { buildFacts, bannedTerms } from './facts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const BROWSER_FILE = {
  survey: 'browser/dump.js',
  readback: 'browser/dump.js',
  'fill-facts': 'browser/fill-facts.js',
  commit: 'browser/commit.js',
};

export const KINDS = Object.keys(BROWSER_FILE);

export function buildSnippet(kind, { city, profile = loadProfile() } = {}) {
  const file = BROWSER_FILE[kind];
  if (!file) throw new Error(`unknown snippet "${kind}". Use one of: ${KINDS.join(', ')}`);
  const source = readFileSync(path.join(here, file), 'utf8').trim();
  const facts = buildFacts(profile, { city });
  facts.banned = bannedTerms(profile);
  return `(${source})(${JSON.stringify(facts)})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const kind = args[0];
  const cityIdx = args.indexOf('--city');
  const city = cityIdx >= 0 ? args[cityIdx + 1] : undefined;
  if (!kind || !BROWSER_FILE[kind]) {
    console.error(`usage: snippet.mjs <${KINDS.join('|')}> [--city X]`);
    process.exit(2);
  }
  console.log(buildSnippet(kind, { city }));
}
