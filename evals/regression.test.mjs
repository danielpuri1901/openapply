// regression.test.mjs - each test replays one real bug from the 100-application
// run, or from a live test the same day, named after the bug it guards. These
// import the real src modules; a case with no home yet is marked { todo }
// instead of guessing at a fix here. Uses profile.example.md (Alex Rivera: EU
// authorized, needs US sponsorship), never real user data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadProfile } from '../src/profile.mjs';
import { buildYesNoRules, buildTextRules } from '../src/fill/facts.mjs';
import { buildSnippet } from '../src/fill/snippet.mjs';
import { wordMatch } from '../src/discover/match.mjs';
import { makeGate } from '../src/qualify/gate.mjs';
import { verify } from '../src/fill/verify.mjs';
import { check } from '../src/shared/humanizer.mjs';
import {
  classifyForm, normalizeAshbySections, normalizeGreenhouseQuestions,
} from '../src/screen/forms.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'));
const profile = loadProfile(path.join(ROOT, 'profile.example.md'));

function answerFor(rules, label) {
  const hit = rules.find((r) => new RegExp(r.source, r.flags).test(label));
  return hit ? { value: hit.value, source: hit.source } : null;
}

// ── 1. authorized-without-sponsorship-checked-before-bare-sponsor-rule ──────
test('"authorized to work in the United States without sponsorship" answers from the authorized flag, checked before the bare sponsor rule', () => {
  const rules = buildYesNoRules(profile, { city: 'New York, United States' });
  const label = 'Are you authorized to work in the United States without sponsorship?';
  const hit = answerFor(rules, label);
  assert.ok(hit, 'no rule matched this label');
  // Alex Rivera: US region is authorized: false, needs_sponsorship: true, so
  // "authorized ... without sponsorship" must read No, not the generic
  // sponsor rule's own answer to a bare "sponsor" match.
  const us = profile.work_authorization.find((w) => w.region === 'US');
  const expected = us.authorized && !us.needs_sponsorship ? 'Yes' : 'No';
  assert.equal(hit.value, expected);
  assert.match(hit.source, /without/);
  const iWithout = rules.findIndex((r) => r.source.includes('without'));
  const iBareSponsor = rules.findIndex((r) => r.source === 'spons?or|visa|immigration');
  assert.ok(iWithout < iBareSponsor, 'the without-sponsorship rule must be tried before the bare sponsor rule');
});

// ── 2. sponsorship-typo-still-matches ────────────────────────────────────
test('sponsorship typo "sponorship" still matches the sponsor rule', () => {
  const rules = buildYesNoRules(profile, { city: 'New York, United States' });
  const hit = answerFor(rules, 'Will you require visa sponorship now or in the future?');
  assert.ok(hit, 'the /spons?or/ typo-tolerant regex must still match "sponorship"');
  const us = profile.work_authorization.find((w) => w.region === 'US');
  assert.equal(hit.value, us.needs_sponsorship ? 'Yes' : 'No');
});

// ── 3. office-location-mention-does-not-hijack-relocation-assistance ────────
const MENLO_PARK_LABEL = 'Our office in Menlo Park offers relocation assistance. Are you able to work in-office?';

test('"office in Menlo Park ... (we offer relocation assistance)" is never answered by the relocation-assistance rule\'s No', () => {
  const rules = buildYesNoRules(profile, {});
  const relocationRule = rules.find((r) => r.source.includes('relocation ('));
  // The relocation-assistance rule requires a verb (need/require/want...)
  // directly before "relocation assistance"; a bare mention of the phrase
  // ("we offer relocation assistance") must not satisfy it.
  assert.equal(new RegExp(relocationRule.source, relocationRule.flags).test(MENLO_PARK_LABEL), false,
    'a bare mention of "relocation assistance" must not trip the relocation-assistance rule');
  const hit = answerFor(rules, MENLO_PARK_LABEL);
  assert.ok(hit, 'no rule matched this label');
  assert.notEqual(hit.source, relocationRule.source);
  assert.equal(hit.value, 'Yes', 'must not fall through to the relocation-assistance rule\'s No');
});

test('"office in Menlo Park ... (we offer relocation assistance)" should answer from in_office_ok, not from willing_to_relocate', () => {
  const divergent = { ...profile, location: { ...profile.location, willing_to_relocate: false, in_office_ok: true } };
  const rules = buildYesNoRules(divergent, {});
  const hit = answerFor(rules, MENLO_PARK_LABEL);
  assert.match(hit.source, /in\.\?office/, 'should be answered by the in-office rule');
  assert.equal(hit.value, 'Yes', 'in_office_ok is true, so an in-office question must read Yes');
});

// ── 4. region-in-label-wins-over-job-city ───────────────────────────────────
test('region named in the label wins over the job city; dotted "U.S." matches with no city; a cityless bare "us" stays unanswered', () => {
  // No job city at all: only label-scoped rules exist.
  const rules = buildYesNoRules(profile, {});

  // "U.S." (with dots) must still resolve the US region purely from the label.
  const dotted = answerFor(rules, 'Are you legally authorized to work in the U.S.?');
  assert.ok(dotted, 'dotted "U.S." must match the US region keyword even with no job city');
  const us = profile.work_authorization.find((w) => w.region === 'US');
  assert.equal(dotted.value, us.authorized ? 'Yes' : 'No');

  // A label with a real region name overrides the job's own city (EU here).
  const rulesEuCity = buildYesNoRules(profile, { city: 'Lisbon, Portugal' });
  const labelWins = answerFor(rulesEuCity, 'Will you require sponsorship to work in the United States?');
  assert.equal(labelWins.value, us.needs_sponsorship ? 'Yes' : 'No');

  // "us" as a bare trailing word ("join us") is not a region keyword (too
  // short to trust as a substring) and there is no job city to fall back on,
  // so this must stay unanswered - never a guessed Yes/No.
  const unanswered = answerFor(rules, 'Will you require sponsorship to join us?');
  assert.equal(unanswered, null, 'a bare "us" with no job city must never be guessed');
});

// ── 5. geo-word-boundary-belarus-russia ─────────────────────────────────────
test('a geo location like "Belarus" or "Russia" must not match a bare "us" keyword', () => {
  assert.equal(wordMatch('Remote, Belarus', 'us'), false);
  assert.equal(wordMatch('Moscow, Russia', 'us'), false);
  assert.equal(wordMatch('Austin, Texas, US', 'us'), true);
});

// ── 6. title-exclusion-before-jd-fetch ──────────────────────────────────────
test('title exclusion is applied before the JD fetch (gate never spends a network call on a blocked title)', async () => {
  const filter = {
    geo: { tiers: [], block: [], always_allow: ['remote'] },
    yoe_ceiling: 3,
    exclude_titles: ['sales engineer'],
    blocked_companies: [],
    max_apps_per_company: 2,
    max_apps_window_days: 90,
    reapply_gap_days: 14,
  };
  let fetched = false;
  const gate = makeGate({
    filter,
    appsDir: path.join(here, 'fixtures', '__no_apps_dir__'),
    fetchJd: async () => { fetched = true; return { text: '', remote: false }; },
  });
  const v = await gate({ key: 'k', company: 'Acme', ats: 'ashby', role_id: '1', title: 'Sales Engineer', loc: 'Lisbon', board: 'acme' });
  assert.equal(v.eligible, 0);
  assert.equal(v.reason, 'excluded-title');
  assert.equal(fetched, false, 'a blocked title must never trigger a JD fetch');
});

// ── 7. essay classifier on real ATS shapes ──────────────────────────────────
test('Ashby fixture with a required LongText classifies essay', () => {
  const json = fixture('ashby-form-essay.json');
  const fields = normalizeAshbySections(json);
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('Ashby fixture with no required LongText classifies no-essay', () => {
  const json = fixture('ashby-form-no-essay.json');
  const fields = normalizeAshbySections(json);
  assert.equal(classifyForm(fields).lane, 'no-essay');
});

test('Ashby GraphQL errors response throws, it must never silently classify as no-essay', () => {
  // Real bug: an errors response once returned an empty field list, which
  // classified every Ashby form on that org as no-essay.
  const json = fixture('ashby-form-errors.json');
  assert.throws(() => normalizeAshbySections(json), /ashby graphql/);
});

test('Ashby null jobPosting throws "closed", never an empty no-essay form', () => {
  const json = fixture('ashby-form-closed.json');
  assert.throws(() => normalizeAshbySections(json), /closed/);
});

test('Greenhouse ?questions=true fixture with a required textarea classifies essay', () => {
  const json = fixture('greenhouse-form.json');
  const fields = normalizeGreenhouseQuestions(json);
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('Greenhouse ?questions=true fixture with only fact fields classifies no-essay', () => {
  const json = fixture('greenhouse-form-no-essay.json');
  const fields = normalizeGreenhouseQuestions(json);
  assert.equal(classifyForm(fields).lane, 'no-essay');
});

// ── 8. verify.mjs blocks a bad dump ─────────────────────────────────────────
function baseDump(overrides = {}) {
  return {
    url: '/apply',
    city: 'New York, United States',
    fields: [
      { kind: 'text', label: 'Full name', value: profile.identity.full_name, required: true },
      { kind: 'file', label: 'Resume', value: 'resume.pdf', required: true },
    ],
    choices: [],
    ...overrides,
  };
}

test('a dump with a wrong Yes/No polarity FAILS', () => {
  const us = profile.work_authorization.find((w) => w.region === 'US');
  const wrongAnswer = us.needs_sponsorship ? 'No' : 'Yes';
  const dump = baseDump({
    choices: [{ kind: 'yesno-button', question: 'Will you now or in the future require sponsorship?', selected: [wrongAnswer], required: true }],
  });
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => b.includes('POLARITY')));
});

test('an empty required resume field FAILS', () => {
  const dump = baseDump();
  dump.fields[1].value = '';
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => /resume field is EMPTY/.test(b)));
});

test('a forbidden fact in a long answer is flagged as a block', () => {
  const dump = baseDump({
    fields: [...baseDump().fields, { kind: 'textarea', label: 'Why us', length: 400, hits: ['forbidden:Example Labs Internal Project'] }],
  });
  const r = verify(dump, { profile });
  assert.equal(r.ok, false);
  assert.ok(r.blocks.some((b) => b.includes('Example Labs Internal Project')));
});

// ── 9. humanizer catches AI tells and forbidden facts ───────────────────────
test('an em dash fails the humanizer check', () => {
  const violations = check('I built this system — it scaled well.');
  assert.ok(violations.some((v) => v.rule === 'em_dash'));
});

test('AI vocabulary fails the humanizer check', () => {
  const violations = check('I want to leverage my experience to delve into this role.');
  assert.ok(violations.some((v) => v.rule === 'ai_vocab' && v.word === 'leverage'));
  assert.ok(violations.some((v) => v.rule === 'ai_vocab' && v.word === 'delve'));
});

test('a forbidden fact fails the humanizer check', () => {
  const violations = check('I worked closely with Example Labs Internal Project.', { forbidden: ['Example Labs Internal Project'] });
  assert.ok(violations.some((v) => v.rule === 'forbidden_fact'));
});

// ── 10. browser snippets: hard lock, no profile leak, recaptcha skip ───────
test('the fill-facts snippet never clicks a submit/apply/send control, even after profile facts are inlined', () => {
  const snippet = buildSnippet('fill-facts', { profile, city: 'New York, United States' });
  const lines = snippet.split('\n');
  for (const line of lines) {
    if (/submit|apply now|send application/i.test(line)) {
      assert.doesNotMatch(line, /\.click\(/, `snippet must never click a control on a line matching submit/apply/send: ${line}`);
    }
  }
});

test('the commit snippet carries no profile data, only page-read logic', () => {
  const snippet = buildSnippet('commit', { profile, city: 'New York, United States' });
  assert.ok(!snippet.includes(profile.identity.email), 'commit snippet must not embed the email');
  assert.ok(!snippet.includes(profile.identity.full_name), 'commit snippet must not embed the full name');
  assert.ok(!snippet.includes(profile.identity.phone), 'commit snippet must not embed the phone number');
  // commit.js is called with an unused FACTS arg; it is passed an empty object.
  assert.match(snippet, /\)\(\{\}\)$/);
});

test('fill-facts skips recaptcha fields instead of filling them', () => {
  const src = readFileSync(path.join(here, '..', 'src', 'fill', 'browser', 'fill-facts.js'), 'utf8');
  assert.match(src, /recaptcha/i);
  const line = src.split('\n').find((l) => /recaptcha/i.test(l));
  assert.match(line, /return/, 'the recaptcha check must bail out of filling that field');
});

// ── 11. location answer never contains a literal "{city}" ──────────────────
test('the location answer never leaks a literal "{city}" placeholder', () => {
  for (const city of [undefined, '', 'Berlin, Germany', 'Singapore']) {
    const rules = buildTextRules(profile, { city });
    const loc = rules.find((r) => r.source.includes('current location'));
    if (loc) assert.doesNotMatch(loc.value, /\{city\}/);
  }
});
