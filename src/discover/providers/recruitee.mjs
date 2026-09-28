// Recruitee provider - public offers endpoint.
import { stripHtml } from './_util.mjs';

export function boardUrl(slug) {
  return `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`;
}

export function parseBoard(json, company) {
  const jobs = Array.isArray(json?.offers) ? json.offers : [];
  return jobs.map((j) => {
    const url = j.careers_url || j.careers_apply_url || '';
    return {
      id: j.id,
      title: j.title || '',
      url,
      applyUrl: j.careers_apply_url || url,
      location: j.location || [j.city, j.country].filter(Boolean).join(', '),
      remote: j.remote === true || /remote/i.test(j.location || ''),
      company,
      text: stripHtml(`${j.description || ''} ${j.requirements || ''}`),
    };
  }).filter((o) => o.url && o.title);
}
