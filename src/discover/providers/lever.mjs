// Lever provider - hits the public postings JSON endpoint.
import { stripHtml } from './_util.mjs';

// Canonical postings endpoint for a known board slug.
export function boardUrl(slug) {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
}

// Normalizes a raw postings response into rows.
export function parseBoard(json, company) {
  const jobs = Array.isArray(json) ? json : [];
  return jobs.map((j) => {
    const url = j.hostedUrl || j.applyUrl || '';
    return {
      id: j.id,
      title: j.text || '',
      url,
      applyUrl: url ? `${url}/apply` : '',
      location: j.categories?.location || '',
      remote: String(j.workplaceType || '').toLowerCase() === 'remote'
        || /\bremote\b/i.test(j.categories?.location || ''),
      company,
      text: stripHtml(j.descriptionPlain || j.description),
    };
  }).filter((o) => o.url);
}
