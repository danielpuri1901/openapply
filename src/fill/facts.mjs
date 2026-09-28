// facts.mjs - turns profile.md into the data a browser fill snippet needs.
//
// One rule list, generated here from the user's own profile, not hardcoded per
// person. The browser scripts only match regexes against labels; every answer
// comes from this module so there is one place that decides what "Yes" means.
//
// Order is load-bearing: a specific rule must be tried before a general one.
// "Authorized to work WITHOUT sponsorship?" contains the word "sponsorship" and
// would fall into the generic sponsor rule if that rule ran first, giving the
// opposite answer of what the question actually asks.

import { forbiddenList } from '../profile.mjs';

function words(s) {
  return String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Whole-word match only. A bare "us" must not match inside "Austin" or
// "Australia" - a real regression once let a geo tier match a substring.
// Pass the posting's fullest location string (city and country when both are
// known); a bare city name will not match a country-level keyword.
const escapeRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function regionFor(city, workAuthorization = []) {
  const cityWords = new Set(words(city));
  if (!cityWords.size) return null;
  for (const wa of workAuthorization) {
    for (const kw of wa.keywords || []) {
      const kwWords = words(kw);
      if (kwWords.length && kwWords.every((w) => cityWords.has(w))) return wa;
    }
  }
  return null;
}

// TEXT rules: label pattern -> literal value. Order matters when patterns can
// both match one label (the combined linkedin+github field first).
export function buildTextRules(profile, { city } = {}) {
  const id = profile.identity || {};
  const loc = profile.location || {};
  const edu = (profile.education || [])[0] || {};
  const region = regionFor(city, profile.work_authorization || []);
  const comp = region && profile.compensation ? profile.compensation[region.region] : null;
  // Without a job city, "{city}" cannot be filled, so fall back to the plain current location.
  const locationAnswer = loc.answer && city ? loc.answer.replace('{city}', city.split(',')[0].trim())
    : (loc.answer && !loc.answer.includes('{city}') ? loc.answer : loc.current);

  const rules = [];
  const add = (source, flags, value) => { if (value) rules.push({ source, flags, value }); };

  if (id.linkedin && id.github) add('github.{0,20}linkedin|linkedin.{0,20}github', 'i', `${id.linkedin}, ${id.github}`);
  add('linkedin', 'i', id.linkedin);
  add('github|portfolio|website', 'i', id.portfolio || id.github);
  add('^(full |legal )?name$|first and last name', 'i', id.full_name);
  add('e-?mail', 'i', id.email);
  add('phone', 'i', id.phone);
  add('current company|current employer', 'i', profile.current_company);
  add('when can you start|start date|earliest availability', 'i', profile.start_date);
  add('where are you (currently )?(based|located)|current location|city do you live', 'i', locationAnswer);
  add('institution|university|school', 'i', edu.school);
  add('major|field of study|discipline', 'i', edu.field);
  add('degree', 'i', edu.degree);
  if (comp) add('salary|compensation|pay range|expected pay', 'i', comp.range || comp.single);
  return rules;
}

// YESNO rules: label pattern -> "Yes" or "No". Specific rules first.
export function buildYesNoRules(profile, { city } = {}) {
  const loc = profile.location || {};
  const region = regionFor(city, profile.work_authorization || []);
  const edu = profile.education || [];
  const ongoing = edu.some((e) => !e.end || new Date(e.end) > new Date());

  const rules = [];
  const add = (source, flags, value) => { if (value != null) rules.push({ source, flags, value }); };

  // Most specific: the label itself names a region ("authorized to work in the
  // United States"). The label wins over the job's city. Keywords shorter than
  // 3 characters ("us", "eu") are skipped here: they match ordinary words.
  for (const wa of profile.work_authorization || []) {
    const kws = (wa.keywords || []).filter((k) => k.length >= 3).map(escapeRe);
    if (!kws.length) continue;
    // Letter/digit guards instead of \\b, so a dotted keyword like "u.s." still matches.
    const scope = `^(?=.*(?<![a-z0-9])(?:${kws.join('|')})(?![a-z0-9]))`;
    add(`${scope}.*without (visa |any )?sponsorship`, 'i', wa.authorized && !wa.needs_sponsorship ? 'Yes' : 'No');
    add(`${scope}.*(spons?or|visa|immigration)`, 'i', wa.needs_sponsorship ? 'Yes' : 'No');
    add(`${scope}.*(authori[sz]ed|legal(ly)? right|eligible to work|unrestricted work)`, 'i', wa.authorized ? 'Yes' : 'No');
  }

  // Next: the label names no region, so use the region of the job's city.
  if (region) add('without (visa |any )?sponsorship', 'i', region.authorized && !region.needs_sponsorship ? 'Yes' : 'No');
  // Specific: needing a relocation package is a different question than being
  // willing to relocate, and it must be checked before the bare "relocat" rule.
  add('(need|require|requesting|seeking|want)\\b.{0,40}relocation (assistance|package|support|benefit)', 'i', loc.needs_relocation_assistance ? 'Yes' : 'No');
  // Generic sponsorship/visa. Allows a typo: /spons?or/.
  if (region) add('spons?or|visa|immigration', 'i', region.needs_sponsorship ? 'Yes' : 'No');
  add('currently enrolled|full.?time education', 'i', ongoing ? 'Yes' : 'No');
  if (region) add('authori[sz]ed|legal(ly)? right|unrestricted work', 'i', region.authorized ? 'Yes' : 'No');
  add('college degree|bachelor', 'i', edu.length ? 'Yes' : 'No');
  // Direct relocation questions first, then in-office, then any other "relocat"
  // mention: "work from our office (we offer relocation assistance)" asks about
  // the office, and the relocation words are only context.
  add('willing to relocate|open to relocat', 'i', loc.willing_to_relocate ? 'Yes' : 'No');
  add('in.?office|on.?site|in.?person|hybrid|come into the office|out of our office', 'i', loc.in_office_ok ? 'Yes' : 'No');
  add('\\brelocat', 'i', loc.willing_to_relocate ? 'Yes' : 'No');
  return rules;
}

// The full set a fill snippet needs, JSON-safe (regexes as {source, flags}).
export function buildFacts(profile, { city } = {}) {
  const id = profile.identity || {};
  return {
    city: city || null,
    identity: { fullName: id.full_name, email: id.email, phone: id.phone },
    eeo: profile.eeo || {},
    neverFill: profile.never_fill || [],
    textRules: buildTextRules(profile, { city }),
    yesNoRules: buildYesNoRules(profile, { city }),
  };
}

// Terms that must never appear in generated free text, plus the punctuation
// the humanizer also bans. Kept in Node so there is exactly one rule list; the
// browser only matches it and returns hits, never the raw banned words back.
export function bannedTerms(profile) {
  const out = forbiddenList(profile).map((t) => ({ l: 'forbidden', t }));
  out.push({ l: 'punctuation', t: '—' }, { l: 'punctuation', t: '–' });
  for (const q of ['‘', '’', '“', '”']) out.push({ l: 'punctuation', t: q });
  return out;
}
