// Greenhouse provider - hits the public boards-api JSON endpoint.
import { stripHtml } from './_util.mjs';

// Canonical boards-api endpoint for a known board slug.
export function boardUrl(slug) {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
}

// Greenhouse has no structured remote flag, only free-text location. Matching
// /remote/ alone is too blunt: "Remote-Friendly, United States; San Francisco,
// CA | New York City, NY" is an OFFICE role that also permits remote. A role
// is remote-only when the location mentions remote AND names no concrete office.
const OFFICE_HINT =
  /\b(san francisco|new york|seattle|london|dublin|tokyo|sydney|toronto|ontario|washington|boston|austin|chicago|los angeles|paris|berlin|amsterdam|zurich|singapore|bangalore|denver|atlanta|miami|philadelphia|portland|san diego|santa monica|palo alto|mountain view|nyc|sf)\b/i;

export function isRemoteOnly(loc) {
  if (!/\bremote\b/i.test(loc)) return false;
  return !OFFICE_HINT.test(loc);
}

// Normalizes a raw boards-api response into rows.
export function parseBoard(json, company) {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.filter((j) => j.absolute_url).map((j) => ({
    id: String(j.id),
    title: j.title || '',
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    location: j.location?.name || '',
    remote: isRemoteOnly(j.location?.name || ''),
    company,
    text: stripHtml(j.content),
  }));
}
