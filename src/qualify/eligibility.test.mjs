import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility, extractMinYoe } from './eligibility.mjs';

const filter = {
  geo: {
    tiers: [{ name: 'lisbon', keywords: ['lisbon', 'portugal'] }, { name: 'us', keywords: ['us', 'usa'] }],
    block: ['bangalore'],
    always_allow: ['remote'],
  },
  yoe_ceiling: 3,
};

test('a remote role passes geo when the profile allows remote, regardless of location text', () => {
  const jd = { text: 'Work from anywhere.', remote: true };
  const v = checkEligibility(jd, 'Anywhere', filter);
  assert.equal(v.eligible, true);
  assert.equal(v.matchedTier, 'remote');
});

test('the structured location settles geo and never falls back to JD boilerplate', () => {
  // JD text mentions "US" in unrelated boilerplate; the stored location is Lisbon.
  const jd = { text: 'Open to candidates across the US and EU offices.', remote: false };
  const v = checkEligibility(jd, 'Lisbon, Portugal', filter);
  assert.equal(v.eligible, true);
  assert.equal(v.matchedTier, 'lisbon');
});

test('a structured location matching no tier is rejected, not text-checked', () => {
  const jd = { text: 'This role is based in Lisbon, Portugal.', remote: false };
  const v = checkEligibility(jd, 'Bangalore', filter);
  assert.equal(v.eligible, false);
  assert.equal(v.reason, 'geo');
});

test('a geo substring bug regression: "us" does not match "Belarus"', () => {
  const jd = { text: 'Remote candidates from Belarus welcome.', remote: false };
  const v = checkEligibility(jd, '', filter);
  assert.equal(v.eligible, false);
  assert.equal(v.reason, 'geo');
});

test('yoe ceiling rejects a JD demanding more years than the profile allows', () => {
  const jd = { text: 'Requires 5+ years of experience. Based in Lisbon.', remote: false };
  const v = checkEligibility(jd, 'Lisbon', filter);
  assert.equal(v.eligible, false);
  assert.equal(v.reason, 'yoe');
});

test('extractMinYoe reads the largest explicit years demand', () => {
  assert.equal(extractMinYoe('2+ years preferred, 5+ years a plus'), 5);
  assert.equal(extractMinYoe('no experience requirement mentioned'), 0);
  assert.equal(extractMinYoe('at least 4 years of backend experience'), 4);
});
