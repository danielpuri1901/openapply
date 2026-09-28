# Tuning golden answers and fixing traps

## Golden answer tuning

Do this when the human edits a drafted answer live in a form, or wants to promote a draft to golden.

1. Draft the answer and show it in the form. Do not save it as golden yet.
2. Let the human edit the text directly on the page.
3. Run `node src/fill/snippet.mjs readback` and read the edited text back from the page.
4. Save that exact text as the golden answer. Do not save your own memory of what the human meant.
5. Write the file in `answers/` with front matter: `id`, `question`, `aliases`, `status: golden`, `approved: <date>`, `reuse_note`.
6. Ask the human for the `reuse_note`: their own words on why the answer works. This stops later drift.
7. Mark a freshly written answer NEW in your notes to the human. Show NEW answers first at the next review.

## Reuse rule

A golden answer is reused by swapping the company name and the per-company hook only.
Run `node src/answers/answers.mjs swap <id> <company> --hook "<line>"`.
Never reuse a hook across companies. A hook is only true for the company it was written about.
Do not rewrite an approved answer's wording.
If an answer no longer fits a new question, draft a new one. Do not force reuse.

## When a fact changes

Search every golden answer and every open tab for the old fact.
Replace it everywhere you find it.
Run `node src/shared/humanizer.mjs -` on every changed file before you use it again.

## Fill-log and the distill loop

Every fill appends one record to `fill-log.jsonl`, through `node src/record/log.mjs fill <json>`.
A record holds the outcome, any trap codes, and turns spent.

Periodically, compare the trap codes in the log against the rules already written in `skills/ats-notes.md`.
A trap that appears 2 or more times, and is not yet written down, is a candidate for a new rule.
Decide first whether it belongs in `skills/ats-notes.md`, then write it there. Do not leave the rule only in the log.

Writing a rule down does not stop the trap by itself.
Prefer a fix that makes the trap impossible over a fix that only tells the agent to be careful.

## Adding a regression fixture

When a trap comes from a real ATS bug, not a one-off mistake, add a fixture to `evals/`.
Shape the fixture like the real platform's form or API response.
Write a test that reproduces the bug on the old code and passes on the fixed code.
This keeps the bug from coming back silently.
