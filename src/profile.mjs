// Loads profile.md, the single user file, and derives every config shape the tools need.
// One source for each setting: the scraper prefilter and the gate read the same lists,
// so they cannot drift apart.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = ['identity.full_name', 'identity.email', 'location.current', 'search.titles', 'search.geo_tiers'];

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Splits "---\n<yaml>\n---\n<markdown>" into { data, body }.
export function parseProfile(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('profile has no YAML front matter (--- ... ---)');
  const data = yaml.load(m[1]) || {};
  return { data, body: m[2].trim() };
}

function withDefaults(d) {
  const search = d.search || {};
  const limits = d.limits || {};
  return {
    ...d,
    work_authorization: d.work_authorization || [],
    education: d.education || [],
    compensation: d.compensation || {},
    eeo: d.eeo || {},
    forbidden: { names: [], customers: [], amounts: [], phrases: [], ...(d.forbidden || {}) },
    never_fill: d.never_fill || [],
    search: {
      titles: [], exclude_titles: [], seniority_block: [], geo_tiers: [], geo_block: [],
      yoe_ceiling: 3, remote_ok: true, ...search,
    },
    limits: {
      max_apps_per_company: 2, window_days: 90, reapply_gap_days: 14,
      blocked_companies: [], company_rules: {}, ...limits,
    },
    submit: { auto_submit_no_essay: false, batch_size: 10, ...(d.submit || {}) },
  };
}

// Returns the validated profile. Throws with a list of missing fields.
// Resolution order: explicit path, $OPENAPPLY_PROFILE, <root>/profile.md.
export function loadProfile(file) {
  const p = file || process.env.OPENAPPLY_PROFILE || path.join(ROOT, 'profile.md');
  if (!existsSync(p)) {
    throw new Error(`no profile at ${p}. Run onboarding (tell your agent "read AGENTS.md") or copy profile.example.md to profile.md`);
  }
  const { data, body } = parseProfile(readFileSync(p, 'utf8'));
  const missing = REQUIRED.filter((k) => {
    const v = get(data, k);
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length) throw new Error(`profile ${p} is missing: ${missing.join(', ')}`);
  return { ...withDefaults(data), body, path: p };
}

// Shape read by the gate and the eligibility check.
export function toFilter(profile) {
  const { search, limits } = profile;
  return {
    geo: {
      tiers: search.geo_tiers,
      block: search.geo_block,
      always_allow: search.remote_ok ? ['remote'] : [],
    },
    yoe_ceiling: search.yoe_ceiling,
    on_site_required: false,
    exclude_titles: [...search.exclude_titles, ...search.seniority_block],
    max_apps_per_company: limits.max_apps_per_company,
    max_apps_window_days: limits.window_days,
    reapply_gap_days: limits.reapply_gap_days,
    blocked_companies: limits.blocked_companies,
    company_rules: limits.company_rules,
  };
}

// Shape read by the scraper prefilter.
export function toScrape(profile) {
  const { search } = profile;
  return {
    titleKeywords: search.titles,
    titleBlock: [...search.exclude_titles, ...search.seniority_block],
    geoKeywords: Object.fromEntries(search.geo_tiers.map((t) => [t.name, t.keywords])),
    remoteOk: search.remote_ok,
  };
}

// Flat list of strings that must never appear in generated text.
export function forbiddenList(profile) {
  const f = profile.forbidden;
  return [...f.names, ...f.customers, ...f.amounts, ...f.phrases].filter(Boolean);
}
