// forms.mjs - pre-screen a posting's application form through the ATS API,
// before any tab opens. Classifies the form as 'no-essay' or 'essay':
// a required long-text field, or a required field whose label reads as an
// essay prompt (why / describe / tell us / video), counts as an essay.
//
// Ashby and Greenhouse expose a public API for this. Other ATSes in this
// repo have no such endpoint, so they default to the essay lane (route to
// the human) rather than guess a form is safe to auto-fill.

const ESSAY_LABEL = /\b(why|describe|tell us|video)\b/i;
const LONG_TYPES = new Set(['longtext', 'long_text', 'textarea', 'richtext', 'rich_text']);

/**
 * @param {Array<{label: string, type: string, required: boolean}>} fields
 * @returns {{lane: 'essay'|'no-essay', reasons: string[]}}
 */
export function classifyForm(fields) {
  const hits = (fields || []).filter((f) => f.required && (
    LONG_TYPES.has(String(f.type || '').toLowerCase()) || ESSAY_LABEL.test(f.label || '')
  ));
  return { lane: hits.length ? 'essay' : 'no-essay', reasons: hits.map((f) => f.label).filter(Boolean) };
}

// ── Ashby: POST the non-user GraphQL endpoint, read applicationForm.sections ──
const ASHBY_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    applicationForm {
      sections { fieldEntries { ... on FormFieldEntry { field isRequired } } }
    }
  }
}`;

// `field` is a JSON scalar, so it cannot take a sub-selection. A GraphQL error
// must throw: an empty field list would wrongly classify an essay form as no-essay.
export function normalizeAshbySections(json) {
  if (json?.errors?.length) throw new Error(`ashby graphql: ${json.errors[0].message}`);
  if (json?.data && json.data.jobPosting === null) throw new Error('ashby posting not found (closed)');
  const sections = json?.data?.jobPosting?.applicationForm?.sections
    ?? json?.jobPosting?.applicationForm?.sections ?? [];
  const fields = [];
  for (const s of sections || []) {
    for (const entry of s.fieldEntries || []) {
      const f = entry.field || {};
      fields.push({ label: f.title || f.label || '', type: f.type || f.fieldType || '', required: entry.isRequired === true });
    }
  }
  return fields;
}

const defaultPostJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

export async function fetchAshbyForm(org, jobPostingId, { postJson = defaultPostJson } = {}) {
  const body = { operationName: 'ApiJobPosting', variables: { organizationHostedJobsPageName: org, jobPostingId }, query: ASHBY_QUERY };
  const json = await postJson('https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting', body);
  return normalizeAshbySections(json);
}

// ── Greenhouse: GET the boards-api job with ?questions=true ──────────────
export function normalizeGreenhouseQuestions(json) {
  const qs = Array.isArray(json?.questions) ? json.questions : [];
  return qs.map((q) => ({ label: q.label || '', type: q.type || '', required: q.required === true }));
}

const defaultGetJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

export async function fetchGreenhouseForm(board, jobId, { fetchJson = defaultGetJson } = {}) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`;
  const json = await fetchJson(url);
  return normalizeGreenhouseQuestions(json);
}

/**
 * Pre-screen one posting. board is the ATS board address (companies.board_slug
 * or slug); jobId is the role_id stored on the discovered row.
 * @returns {Promise<{lane: 'essay'|'no-essay', reasons: string[]}>}
 */
export async function prescreen(ats, board, jobId, opts = {}) {
  if (ats === 'ashby') return classifyForm(await fetchAshbyForm(board, jobId, opts));
  if (ats === 'greenhouse') return classifyForm(await fetchGreenhouseForm(board, jobId, opts));
  return { lane: 'essay', reasons: ['no-prescreen-api'] };
}
