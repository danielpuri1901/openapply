// Personio provider - the public search.json a Personio careers site exposes.
import { stripHtml } from './_util.mjs';

export function boardUrl(slug) {
  return `https://${encodeURIComponent(slug)}.jobs.personio.de/search.json`;
}

export function parseBoard(json, company) {
  const jobs = Array.isArray(json) ? json : (Array.isArray(json?.jobs) ? json.jobs : []);
  return jobs.map((j) => {
    const url = `https://${company}.jobs.personio.de/job/${j.id}`;
    const loc = j.office || (Array.isArray(j.offices) ? j.offices.join(', ') : '');
    return {
      id: j.id,
      title: j.name || j.title || '',
      url,
      applyUrl: url,
      location: loc,
      remote: /remote/i.test(loc) || /remote/i.test(j.schedule || ''),
      company,
      text: stripHtml(j.description || ''),
    };
  }).filter((o) => o.title);
}
