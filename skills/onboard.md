# Onboarding

Run this once, the first time this repo runs for a new user.
Do this before the application loop in `skills/apply.md`.

## 1. Check requirements

Check for each of these. Report what is missing before you continue.

- `node --version` is 22.5 or later.
- A LaTeX engine is installed: `tectonic` or `pdflatex`.
- `pdftotext` is installed (optional, but the CV check needs it).
- The Claude in Chrome extension is connected.

## 2. Get the CV

Ask the user to drop their CV file (PDF or DOCX) into the chat, or give a file path.
Read the file. For a PDF, you can also run `pdftotext <file> -` to get the text.
Rebuild it in `cv/template.tex`: replace every double-brace token with the user's real content, and save the result as `cv/cv.tex`.
Keep the template's one-column, ATS-safe layout. Do not add columns, tables, icons, or photos.
Copy facts exactly. Do not improve numbers, titles, or dates. Ask when something is unclear.
Keep the `% OPENAPPLY:LOCATION` line. It lets the tool build one CV per target city.

## 3. Build and check the CV

Run `node src/tailor/cv.mjs build`.
Run `node src/tailor/cv.mjs check <pdf>` on the result.
Fix anything the check flags (missing section, more than two pages, contact info not recoverable as text) before you continue.

## 4. Interview for the profile

First, pre-fill every field you can from the CV: name, contact details, links, education, current company, years of experience.
Show the user the pre-filled values and ask them to confirm or correct them in one reply.
Then ask only for what a CV does not hold.

Ask the user for each field below, in this order.
Ask one group at a time. Use `profile.example.md` as the field reference.
Do not skip a field silently; if the user has no answer, leave it empty and say so.

1. Identity: name, email, phone, LinkedIn, GitHub, portfolio.
2. Location: current city, willingness to relocate, relocation assistance, in-office comfort.
3. Work authorization: one entry per region the user might work in, with keywords, authorized, and needs-sponsorship.
4. Education and experience: schools, degrees, years of full-time experience, current company, start-date availability.
5. Compensation: a range and a single number, per region.
6. EEO: voluntary self-identification answers. "Decline to answer" is always valid.
7. Search filters: target titles, excluded titles, seniority to block, years-of-experience ceiling, remote comfort, geo tiers, geo block list.
8. Limits: max applications per company, time window, re-apply gap, blocked companies, per-company rules.
9. Forbidden facts and never-fill items: names, employers, or numbers that must never appear in generated text; form sections that always go to the human.
10. Submit policy: default is human-submits-everything. Ask if the user wants `auto_submit_no_essay` and a batch size.

## 5. Write the profile

Write the answers to `profile.md` in the repo root, in the same YAML-front-matter-plus-Markdown shape as `profile.example.md`.
This file is gitignored. It never leaves the user's machine through git.

## 6. Collect golden answers

Ask the user for 3 to 4 answers in their own words: why this company, a technical story, why a startup, and a short cover letter (under 250 words).
Each one goes in `answers/<id>.md`, in the same shape as `answers.example/`. Use `{company}`, `{role}`, and `{hook}` where the text changes per company.
The cover letter answer must have the id `cover-letter`. `node src/tailor/letter.mjs` builds letter PDFs from it.
Use `answers.example/` as the shape reference (front matter: `id`, `question`, `aliases`, `status`, `approved`, `reuse_note`).
Write each answer as its own file in `answers/` (gitignored).
Run `node src/shared/humanizer.mjs -` on each answer before you save it as golden.

## 7. Load companies

Run `node src/discover/seed.mjs` to load the starter list in `seeds/boards.txt` (about 350 public job boards, mostly AI and software startups in the US and Europe).
Ask the user for any companies they want that are not on the list.
For each one, run `node src/discover/add-company.mjs <careers-url>`.
Run `node src/discover/scrape.mjs`. The first scrape takes about 5 minutes.
Run `node src/screen/pool.mjs --limit 40` and show the user the funnel.
Onboarding is only done when the pool is not empty. If it is empty, widen `search` in `profile.md` with the user and run the pool again.

## 8. Dry run

Pick one real posting from a company just added.
Run the full fill procedure from `skills/apply.md`, steps 4 through 6 (preflight, fill, commit, verify).
Show the user the filled tab.
Do not submit it. Do not run the submit step.
Ask the user to confirm the fill looks right before they trust the loop on a full batch.
