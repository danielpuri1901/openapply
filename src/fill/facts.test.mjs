import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadProfile } from '../profile.mjs';
import { regionFor, buildTextRules, buildYesNoRules, buildFacts, bannedTerms } from './facts.mjs';

const profile = loadProfile(path.join(ROOT, 'profile.example.md'));

test('regionFor matches whole words only, not a substring inside another word', () => {
  const wa = profile.work_authorization;
  // "us" must not match inside "Austin" or "Australia".
  assert.equal(regionFor('Austin, Texas', wa), null);
  assert.equal(regionFor('Sydney, Australia', wa), null);
  assert.equal(regionFor('New York, United States', wa).region, 'US');
  assert.equal(regionFor('Lisbon, Portugal', wa).region, 'EU');
});

test('regionFor returns null with no city and no fabricated region', () => {
  assert.equal(regionFor('', profile.work_authorization), null);
  assert.equal(regionFor(undefined, profile.work_authorization), null);
});

test('yesNoRules: the specific "without sponsorship" rule precedes the generic sponsor rule', () => {
  const rules = buildYesNoRules(profile, { city: 'New York, United States' });
  const iWithout = rules.findIndex((r) => r.source.includes('without'));
  const iGeneric = rules.findIndex((r) => r.source.includes('spons?or'));
  assert.ok(iWithout >= 0 && iGeneric >= 0);
  assert.ok(iWithout < iGeneric, 'the specific rule must be tried before the generic one');
});

test('yesNoRules: relocation-assistance rule precedes the bare relocate rule', () => {
  const rules = buildYesNoRules(profile, {});
  const iAssist = rules.findIndex((r) => r.source.includes('relocation ('));
  const iBare = rules.findIndex((r) => r.source.includes('\\brelocat'));
  assert.ok(iAssist >= 0 && iBare >= 0);
  assert.ok(iAssist < iBare);
});

test('yesNoRules: with no region match, only label-scoped sponsorship rules exist (never a bare guess)', () => {
  const rules = buildYesNoRules(profile, { city: 'Singapore' });
  const bare = rules.filter((r) => r.source.includes('spons?or') && !r.source.startsWith('^(?='));
  assert.equal(bare.length, 0);
});

test('yesNoRules: a region named in the label wins over the job city', () => {
  const rules = buildYesNoRules(profile, { city: 'Singapore' }).map((r) => [new RegExp(r.source, r.flags), r.value]);
  const answer = (label) => (rules.find(([re]) => re.test(label)) || [])[1];
  const us = profile.work_authorization.find((w) => w.keywords.includes('united states'));
  assert.equal(answer('Will you require sponsorship to work in the United States?'), us.needs_sponsorship ? 'Yes' : 'No');
  assert.equal(answer('Will you require sponsorship to join us?'), undefined);
});

test('yesNoRules: reflects the matched region correctly for authorized/sponsor', () => {
  const us = buildYesNoRules(profile, { city: 'San Francisco, United States' });
  const sponsorUS = us.find((r) => r.source === 'spons?or|visa|immigration');
  assert.equal(sponsorUS.value, 'Yes'); // US region in the example profile needs sponsorship

  const eu = buildYesNoRules(profile, { city: 'Lisbon, Portugal' });
  const sponsorEU = eu.find((r) => r.source === 'spons?or|visa|immigration');
  assert.equal(sponsorEU.value, 'No');
});

test('yesNoRules: in-office and relocate read from separate profile flags', () => {
  const rules = buildYesNoRules(profile, {});
  const office = rules.find((r) => r.source.includes('on.?site'));
  const relocate = rules.find((r) => r.source.includes('willing to relocate'));
  assert.equal(office.value, profile.location.in_office_ok ? 'Yes' : 'No');
  assert.equal(relocate.value, profile.location.willing_to_relocate ? 'Yes' : 'No');
});

test('textRules: combined linkedin+github rule is tried before the bare linkedin rule', () => {
  const rules = buildTextRules(profile, {});
  const iCombo = rules.findIndex((r) => r.source.includes('github.{0,20}linkedin'));
  const iSolo = rules.findIndex((r) => r.source === 'linkedin');
  assert.ok(iCombo >= 0 && iSolo >= 0);
  assert.ok(iCombo < iSolo);
});

test('textRules: location answer substitutes {city}', () => {
  const rules = buildTextRules(profile, { city: 'Berlin' });
  const loc = rules.find((r) => r.source.includes('current location'));
  assert.match(loc.value, /Berlin/);
});

test('textRules: compensation resolves for the matched region only', () => {
  const us = buildTextRules(profile, { city: 'New York, United States' });
  const comp = us.find((r) => r.source.includes('salary'));
  assert.equal(comp.value, profile.compensation.US.range);

  const none = buildTextRules(profile, { city: 'Singapore' });
  assert.ok(!none.some((r) => r.source.includes('salary')));
});

test('buildFacts assembles a JSON-safe payload', () => {
  const facts = buildFacts(profile, { city: 'Lisbon, Portugal' });
  const roundtrip = JSON.parse(JSON.stringify(facts));
  assert.equal(roundtrip.city, 'Lisbon, Portugal');
  assert.equal(roundtrip.identity.fullName, profile.identity.full_name);
  assert.ok(Array.isArray(roundtrip.yesNoRules));
  assert.ok(Array.isArray(roundtrip.textRules));
});

test('bannedTerms includes forbidden facts and banned punctuation', () => {
  profile.forbidden.names = ['Secret Co'];
  const terms = bannedTerms(profile);
  assert.ok(terms.some((t) => t.t === 'Secret Co'));
  assert.ok(terms.some((t) => t.t === '—')); // em dash
});
