import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyForm, normalizeAshbySections, normalizeGreenhouseQuestions, fetchAshbyForm, fetchGreenhouseForm, prescreen,
} from './forms.mjs';

test('a required long-text field makes a form essay, regardless of its label', () => {
  const fields = [{ label: 'Notes', type: 'LongText', required: true }];
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('a required short-text field asking "why" makes a form essay', () => {
  const fields = [{ label: 'Why do you want to work here?', type: 'Text', required: true }];
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('an unrequired essay-shaped field does not tip the form to essay', () => {
  const fields = [{ label: 'Cover letter (optional)', type: 'LongText', required: false }];
  assert.equal(classifyForm(fields).lane, 'no-essay');
});

test('only fact fields (name, email, resume) is a no-essay form', () => {
  const fields = [
    { label: 'Full name', type: 'Text', required: true },
    { label: 'Email', type: 'Text', required: true },
    { label: 'Resume', type: 'FileUpload', required: true },
  ];
  assert.equal(classifyForm(fields).lane, 'no-essay');
});

test('normalizeAshbySections flattens fieldEntries across sections', () => {
  const json = {
    data: {
      jobPosting: {
        applicationForm: {
          sections: [
            { fieldEntries: [{ field: { title: 'Name', type: 'Text' }, isRequired: true }] },
            { fieldEntries: [{ field: { title: 'Why us?', type: 'LongText' }, isRequired: true }] },
          ],
        },
      },
    },
  };
  const fields = normalizeAshbySections(json);
  assert.equal(fields.length, 2);
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('normalizeGreenhouseQuestions reads label, type and required', () => {
  const json = { questions: [{ label: 'Describe a project you are proud of', type: 'long_text', required: true }] };
  const fields = normalizeGreenhouseQuestions(json);
  assert.equal(classifyForm(fields).lane, 'essay');
});

test('fetchAshbyForm POSTs the GraphQL query and normalizes the result', async () => {
  let sentBody;
  const fields = await fetchAshbyForm('acme', 'job-123', {
    postJson: async (url, body) => { sentBody = body; return { jobPosting: { applicationForm: { sections: [] } } }; },
  });
  assert.equal(sentBody.variables.organizationHostedJobsPageName, 'acme');
  assert.equal(sentBody.variables.jobPostingId, 'job-123');
  assert.deepEqual(fields, []);
});

test('fetchGreenhouseForm GETs the board API with questions=true', async () => {
  let sentUrl;
  const fields = await fetchGreenhouseForm('acme', '42', {
    fetchJson: async (url) => { sentUrl = url; return { questions: [] }; },
  });
  assert.match(sentUrl, /boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\/42\?questions=true/);
  assert.deepEqual(fields, []);
});

test('prescreen defaults an ATS with no known pre-screen API to the essay lane', async () => {
  const v = await prescreen('lever', 'acme', '1');
  assert.equal(v.lane, 'essay');
  assert.deepEqual(v.reasons, ['no-prescreen-api']);
});
