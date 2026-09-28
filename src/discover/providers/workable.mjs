// Workable provider - the public widget account endpoint.
import { stripHtml } from './_util.mjs';

export function boardUrl(slug) {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
}

export function parseBoard(json, company) {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map((j) => {
    const url = j.url || j.shortlink || j.application_url || '';
    return {
      id: j.shortcode || j.id,
      title: j.title || '',
      url,
      applyUrl: j.application_url || url,
      location: [j.city, j.state, j.country].filter(Boolean).join(', '),
      remote: j.telecommuting === true,
      company,
      text: stripHtml(j.description || j.requirements || ''),
    };
  }).filter((o) => o.url && o.title);
}
