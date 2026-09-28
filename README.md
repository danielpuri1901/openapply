# OpenApply

OpenApply finds job postings that match your profile.
It fills the application forms in your Chrome browser.
It stops before it submits, so you stay in control.
One real run of this loop filled about 100 applications in two working days.

## Safety

- The agent never clicks Submit, unless you set `auto_submit_no_essay: true` and approve each batch yourself.
- The agent never invents a fact.
  If your profile has no answer, it leaves the field blank and tells you.
- Legal, consent, and certification checkboxes always wait for you.
- Every generated answer is checked for forbidden facts and AI-sounding phrases before you see it.
- Your data stays on your machine.
  Your profile, your answers, and your application history are never committed to git.

## Quickstart

1. Clone this repository.
2. Run `npm install`.
3. Install the Claude in Chrome browser extension and connect it to the Chrome profile you use for job applications.
4. Open Claude Code in this folder.
5. Say: "read AGENTS.md".
   The agent checks for a profile and starts onboarding if you do not have one yet.

## Requirements

- Node.js 22.5 or later.
- Google Chrome, with the Claude in Chrome extension installed and connected.
- A LaTeX engine to build your CV PDF: `tectonic` (recommended) or `pdflatex`.
- `pdftotext` (optional). Without it, the CV check cannot read your PDF text.

## What this does not do

- It does not click Submit for you, unless you opt in and approve each batch.
- It does not write your CV or your answers for you.
  You give it the source facts. It fills forms from them.
- It does not fill more than one form at a time.
  Filling stays serial, so a shared browser tab is never overwritten.
- It does not guess your work authorization, your salary, or any other fact.
  A missing fact means a blank field and a flag for you, not a guess.

See `AGENTS.md` for the full command reference and the rules the agent follows.
