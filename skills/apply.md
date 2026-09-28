# The application loop

Run this after onboarding (`skills/onboard.md`) is done.
Follow every step in order. Do not skip preflight. Do not skip verify.

## 1. Load context

Read `profile.md`, `AGENTS.md`, and every file in `answers/` before you act.
Every fact you type into a form must trace back to one of these sources.

## 2. Discover and screen

Run `node src/discover/scrape.mjs` to update the book from known boards.
To add a new company, run `node src/discover/add-company.mjs <careers-url>`.
Run `node src/screen/pool.mjs --limit 30` to build the eligible pool.
This step pre-screens every form through the ATS API and writes `output/pool.json`.
Each entry has a `lane`: `no-essay` or `essay`.
Read the funnel counts it prints.

## 3. Pick a batch

Pick up to `submit.batch_size` postings from the pool (default 10).
`pool.mjs` already removed postings that hit a company cap or a recent-application cooldown.

## 4. Preflight

For each posting, run:

```
node src/fill/preflight.mjs <company> <posting-url>
```

Read the result.

- GO: continue to fill.
- WARN: read the warning and proceed only if it is safe to do so.
- REFUSE: skip this posting. Do not open a tab.

If you drop a posting after GO (closed, blocked, the human says no), run `node src/record/log.mjs skip <company> <url> <reason>` to release its lease.

Preflight also prints a browser checklist.
Confirm the connected browser is correct, then open one fresh tab.

## 5. Fill

For each GO posting, open one fresh tab on the posting URL.
Never reuse a tab from an earlier posting.

1. Upload the CV variant that matches the posting's city first. Build it if it does not exist yet: `node src/tailor/cv.mjs build --city "<city>"`.
   Upload it with the Claude in Chrome file upload tool, into the real Resume field, not the "Autofill from resume" field.
   The ATS resume parser then overwrites Name, Email, Phone, and Location. That is why the upload comes first.
2. Run `node src/fill/snippet.mjs survey` and paste the output with `javascript_tool` to read every field.
3. Run `node src/fill/snippet.mjs fill-facts --city "<job location>"` to fill the fact fields from the profile. This also repairs what the parser overwrote.
   Fill any location autocomplete by hand: click it, type the city, wait two seconds, and click the exact option.
4. For an essay field, find the golden answer with `node src/answers/answers.mjs find "<question>"`.
   Print it for this company with `node src/answers/answers.mjs swap <id> <company> --hook "<line>"`.
   The hook is one line about this company from one real source you opened: a post, a podcast, or funding news.
   Use a research subagent to find it, and copy titles exactly as shown.
   If no real source exists, leave the hook out and flag the answer for the human. Exit code 3 means the hook is missing.
   With no golden answer, draft from `profile.md` only and mark it NEW.
   Check every answer with `node src/shared/humanizer.mjs -`, then type it in.

## 6. Commit and verify

Run `node src/fill/snippet.mjs commit` on every field, right before you would submit.
Run `node src/fill/snippet.mjs readback` and save the JSON dump to a file.
Run `node src/fill/verify.mjs <dump.json>`.
Read PASS or the FLAG list.
Fix every FLAG before you move on to review.

## 7. Review

No-essay forms: hand the dump files to a reviewer subagent, on a cheap model.
Tell the reviewer to read the dump files only, compare each answer against `profile.md` directly, and grade the form PASS or FAIL.
The reviewer must check the profile itself. It must not read the same answer source the filler used.

Example reviewer instructions:

```
You are reviewing one filled job application form.
Read the dump file at <path>. Do not read any other notes about this form.
Compare each answer to profile.md and to the posting facts (company, role, city).
Reply PASS if every answer is correct, complete, and consistent with the profile.
Reply FAIL with the specific field and the reason, if not.
```

Essay forms: always go to the human.
Show the human any NEW-flagged answer first.

## 8. Submit

Default: the human clicks Submit on every tab.

If `submit.auto_submit_no_essay` is `true` (experimental):

- The agent may submit a no-essay form only when all of these hold:
  1. `verify` printed PASS with no flags.
  2. The reviewer subagent returned PASS on the dump.
  3. You took a screenshot of the whole form and checked it against the dump. Fieldset questions and the uploaded file are not always in the dump.
  4. You showed the human the list of tabs in the batch (company, role, every Yes/No answer), and the human said "yes" to that list.
- Scroll the Submit button into view, take a screenshot, and click it by its element reference, not by guessed coordinates.
- Confirm the success page and save its URL or text in the fill-log `notes` for that form.
- Essay forms are still always submitted by the human.

Assign each tab to one submitter, agent or human. Do not let the other one act on that tab.
After a submit, confirm the success page (the URL or the confirmation text) before you close the tab.
Close a tab only right after you record its outcome. Never close a tab mid-batch for any other reason.

## 9. Record

For every submitted form:

```
node src/record/log.mjs applied <company> <posting-url>
```

For every filled form, submitted or not:

```
node src/record/log.mjs fill <json>
```

Include the outcome, any trap codes, and turns spent.
Run `node src/record/status.mjs` to see the updated funnel.

## 10. Reconcile

At the end of a batch, check each recorded outcome against real evidence: the confirmation page, an email, or the platform's own applicant list.
Fix any record that does not match what actually happened.
