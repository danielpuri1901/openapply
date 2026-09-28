import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadProfile } from '../profile.mjs';
import { buildSnippet, KINDS } from './snippet.mjs';

const profile = loadProfile(path.join(ROOT, 'profile.example.md'));

test('every documented kind produces a paste-able (async (FACTS) => {...})(json) snippet', () => {
  for (const kind of KINDS) {
    const out = buildSnippet(kind, { profile, city: 'Lisbon, Portugal' });
    assert.ok(out.startsWith('('), `${kind} snippet must be wrapped in an invoking (...)`);
    assert.ok(out.endsWith(')'), `${kind} snippet must end with the invocation`);
    assert.match(out, /async\s*\(_?FACTS\)\s*=>\s*\{/, `${kind} snippet must be an async (FACTS) => {...} function`);
    // the invoking arguments are a JSON object, never a bare eval-able string.
    const jsonStart = out.lastIndexOf('})(') + 3;
    assert.doesNotThrow(() => JSON.parse(out.slice(jsonStart, -1)), `${kind} snippet's inlined FACTS must be valid JSON`);
  }
});

test('an unknown kind throws instead of printing garbage', () => {
  assert.throws(() => buildSnippet('nope', { profile }), /unknown snippet/);
});

test('the inlined FACTS payload round-trips as JSON and carries the profile identity', () => {
  const out = buildSnippet('fill-facts', { profile, city: 'New York, United States' });
  const jsonStart = out.lastIndexOf('})(') + 3;
  const facts = JSON.parse(out.slice(jsonStart, -1));
  assert.equal(facts.identity.fullName, profile.identity.full_name);
  assert.equal(facts.city, 'New York, United States');
  assert.ok(Array.isArray(facts.yesNoRules) && facts.yesNoRules.length > 0);
});

test('never uses eval - facts are a literal, not a string to evaluate', () => {
  const out = buildSnippet('fill-facts', { profile, city: 'Lisbon' });
  assert.doesNotMatch(out, /\beval\s*\(/);
});
