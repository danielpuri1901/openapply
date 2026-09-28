// Teamtailor provider - the public JSON Feed a Teamtailor site exposes.
// Not the authenticated Teamtailor API, which needs a key we do not have.
import { stripHtml } from './_util.mjs';

export function boardUrl(slug) {
  return `https://${encodeURIComponent(slug)}.teamtailor.com/jobs.json`;
}

export function parseBoard(json, company) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((j) => {
    const jp = j._jobposting || {};
    // schema.org jobLocation is an ARRAY of Place, not a single object. Reading
    // it as an object yields an empty location, and an empty location is an
    // automatic geo reject downstream, so every role from the board vanishes.
    const places = Array.isArray(jp.jobLocation) ? jp.jobLocation : (jp.jobLocation ? [jp.jobLocation] : []);
    const loc = places
      .map((p) => [p?.address?.addressLocality, p?.address?.addressRegion, p?.address?.addressCountry].filter(Boolean).join(', '))
      .filter(Boolean).join(' | ') || jp.location || '';
    return {
      id: j.id,
      title: j.title || jp.title || '',
      url: j.url || '',
      applyUrl: j.url || '',
      location: loc,
      remote: /remote/i.test(loc) || jp.jobLocationType === 'TELECOMMUTE',
      company,
      text: stripHtml(j.content_html || ''),
    };
  }).filter((o) => o.url && o.title);
}
