// Deterministic checks for AI-writing tells and leaked facts. Every golden
// answer runs through this before it is typed, and again after the fill.
// Checks: em dash, AI-vocabulary words, rule-of-three lists, forbidden facts.
// No LLM, no network, so it costs nothing to run on every answer.

import { readFileSync } from 'node:fs';
import { loadProfile, forbiddenList } from '../profile.mjs';

export const DEFAULT_AI_VOCAB = [
  'delve', 'delving', 'leverage', 'leveraging', 'unleash', 'unleashing',
  'tapestry', 'journey', 'realm', 'elevate', 'elevating', 'commitment',
  'tackle', 'tackling', 'crucial', 'enhance', 'enhancing', 'fostering',
  'garner', 'showcase', 'showcasing', 'underscore', 'underscores',
  'underscoring', 'vibrant', 'seamless', 'seamlessly', 'groundbreaking',
  'navigating', 'testament', 'intricate', 'pivotal', 'align with',
  'in the realm of', 'a testament to',
];

// Extra banned words from the profile's Voice section, e.g.:
//   - Never: "passionate", "leverage", "synergy".
export function neverWords(body) {
  const m = String(body || '').match(/never:\s*(.+)/i);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((hit) => hit[1]);
}

function wordHits(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || [];
}

// Checks one block of text. Returns an empty array when it is clean.
export function check(text, { vocab = DEFAULT_AI_VOCAB, forbidden = [] } = {}) {
  const violations = [];
  const body = String(text || '');

  const emDashes = body.match(/—/g);
  if (emDashes) violations.push({ rule: 'em_dash', count: emDashes.length });

  for (const word of vocab) {
    const hits = wordHits(body, word);
    if (hits.length) violations.push({ rule: 'ai_vocab', word, count: hits.length });
  }

  const ruleOfThree = body.match(/\b(\w{4,})\s*,\s*(\w{4,})\s*,\s*and\s+(\w{4,})\b/gi);
  if (ruleOfThree) violations.push({ rule: 'rule_of_three', count: ruleOfThree.length, sample: ruleOfThree[0] });

  for (const fact of forbidden) {
    if (fact && body.toLowerCase().includes(String(fact).toLowerCase())) {
      violations.push({ rule: 'forbidden_fact', fact });
    }
  }

  return violations;
}

function readInput(arg) {
  if (!arg || arg === '-') return readFileSync(0, 'utf8');
  return readFileSync(arg, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = readInput(process.argv[2]);
  let profile = null;
  try { profile = loadProfile(); } catch { /* no profile.md yet: check with defaults only */ }
  const vocab = profile ? [...DEFAULT_AI_VOCAB, ...neverWords(profile.body)] : DEFAULT_AI_VOCAB;
  const forbidden = profile ? forbiddenList(profile) : [];
  const violations = check(text, { vocab, forbidden });
  const pass = violations.length === 0;
  console.log(JSON.stringify({ pass, violations }, null, 2));
  process.exit(pass ? 0 : 1);
}
