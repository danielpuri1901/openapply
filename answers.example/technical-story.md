---
id: technical-story
question: "Tell us about a technical project you are proud of."
aliases:
  - "describe a technical challenge"
  - "walk us through a project you built"
  - "most technical project"
status: golden
approved: 2026-09-20
reuse_note: "Lead with the metric, stay in past tense, stop after the result. No forward-looking close."
---

For my final-year project I built a retrieval system over 40,000 support tickets and evaluated it on a held-out split.
The first version ranked results by keyword overlap alone, and it missed paraphrased questions, so I added an embedding-based re-ranker on top of the keyword pass.
That change raised top-3 retrieval accuracy on the held-out set, and it is the project that taught me to measure a change before I trust it.
