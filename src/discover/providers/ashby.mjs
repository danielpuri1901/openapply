// Ashby provider - hits the public posting-api JSON endpoint.
import { stripHtml } from './_util.mjs';

// Canonical posting-api endpoint for a known board slug.
export function boardUrl(slug) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=false`;
}

// Normalizes a raw posting-api response into rows.
export function parseBoard(json, company) {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map((j) => {
    const url = j.jobUrl || j.applyUrl || '';
    return {
      id: j.id,
      title: j.title || '',
      url,
      applyUrl: url ? `${url}/application` : '',
      location: j.location || j.address?.postalAddress?.addressLocality || '',
      // Board-declared workplace type. A city list does NOT mean on-site: some
      // forward-deployed roles list cities and are still isRemote:true. But
      // isRemote alone cannot decide it either: Ashby sets isRemote:true on
      // Hybrid postings too. workplaceType is the precise field; only 'Remote'
      // is remote. Fall back to isRemote only when the board omits it.
      remote: j.workplaceType != null && j.workplaceType !== ''
        ? String(j.workplaceType).toLowerCase() === 'remote'
        : j.isRemote === true,
      // True only when the board explicitly declared OnSite or Hybrid, and
      // neither the title nor the location itself says remote. The gate trusts
      // this over JD prose, which can mention "remote" in unrelated culture copy.
      onSiteStated: j.workplaceType != null && j.workplaceType !== ''
        && String(j.workplaceType).toLowerCase() !== 'remote'
        && !/\bremote\b/i.test(String(j.location || ''))
        && !/\bremote\b/i.test(String(j.title || '')),
      company,
      text: stripHtml(j.descriptionPlain || j.descriptionHtml),
    };
  }).filter((o) => o.url);
}
