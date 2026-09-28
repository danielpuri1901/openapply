// BambooHR provider - public careers list endpoint.
import { stripHtml } from './_util.mjs';

export function boardUrl(slug) {
  return `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`;
}

export function parseBoard(json, company) {
  const jobs = Array.isArray(json?.result) ? json.result : [];
  return jobs.map((j) => {
    // `location` is often all-null while `atsLocation` carries the real values.
    const loc = j.location || {};
    const ats = j.atsLocation || {};
    const city = [loc.city || ats.city, loc.state || ats.state || ats.province, ats.country]
      .filter(Boolean).join(', ');
    const url = `https://${company}.bamboohr.com/careers/${j.id}`;
    return {
      id: j.id,
      title: j.jobOpeningName || '',
      url,
      applyUrl: url,
      location: city || j.locationName || '',
      remote: /remote/i.test(j.locationType || '') || /remote/i.test(city),
      company,
      text: stripHtml(j.jobOpeningShareUrl ? '' : (j.description || '')),
    };
  }).filter((o) => o.title);
}
