---
# OpenApply profile. This is the ONE file you fill in.
# Copy it to profile.md (gitignored) or let the agent write it for you during onboarding.
# Everything the tool types into a form comes from here or from answers/.
# If a fact is not here, the agent leaves the field for you. It never guesses.

identity:
  full_name: "Alex Rivera"
  first_name: "Alex"
  last_name: "Rivera"
  preferred_name: "Alex"
  pronouns: ""            # leave empty to skip pronoun fields
  email: "alex.rivera@example.com"
  phone: "+351 912 345 678"
  linkedin: "https://www.linkedin.com/in/alex-rivera-example"
  github: "https://github.com/alex-rivera-example"
  portfolio: ""

location:
  current: "Lisbon, Portugal"
  # What to type when a form asks where you are based. {city} is the job's city.
  answer: "Lisbon, Portugal (relocating to {city})"
  willing_to_relocate: true
  needs_relocation_assistance: false
  in_office_ok: true      # answers "can you work on-site / in person / hybrid"

# One entry per country or region you might work in.
# The Yes/No filler answers "authorized to work in X" and "need sponsorship in X" from this list.
# Keywords match the question text first ("...in the United States?"), then the job's location.
# List the country names AND the cities you target, so a job in "San Francisco, CA" finds its region.
work_authorization:
  - region: "EU"
    keywords: ["eu", "european union", "portugal", "spain", "france", "netherlands", "germany"]
    authorized: true
    needs_sponsorship: false
  - region: "US"
    keywords: ["us", "u.s.", "united states", "america", "new york", "san francisco", "bay area"]
    authorized: false
    needs_sponsorship: true

education:
  - school: "University of Lisbon"
    degree: "BSc Computer Science"
    field: "Computer Science"
    start: "2022-09"
    end: "2025-07"
    gpa: ""               # leave empty to skip GPA fields

experience_years: 1       # full-time years, used for "years of experience" questions
current_company: "Example Labs"
start_date: "Two weeks after an offer"

# Salary answers per region. Forms that want one number get `single`.
compensation:
  US: { range: "$110,000 - $140,000", single: "125000" }
  EU: { range: "EUR 55,000 - 70,000", single: "60000" }

# Voluntary self-identification. "Decline" is always a valid answer.
eeo:
  gender: "Decline to self-identify"
  race: "Decline to self-identify"
  hispanic: "Decline to self-identify"
  veteran: "I am not a protected veteran"
  disability: "I do not want to answer"

# What jobs to look for. One list feeds both the scraper and the gate.
search:
  titles: ["ai engineer", "applied ai", "forward deployed", "founding engineer", "software engineer", "product engineer"]
  exclude_titles: ["solutions engineer", "sales engineer", "product manager", "intern"]
  seniority_block: ["senior", "staff", "principal", "lead", "director", "head of", "manager"]
  yoe_ceiling: 3          # roles asking for more years than this are skipped
  remote_ok: true
  # Ordered by preference. A role must match one tier (or be remote, if remote_ok).
  geo_tiers:
    - { name: "lisbon", keywords: ["lisbon", "lisboa", "portugal"] }
    - { name: "eu", keywords: ["madrid", "barcelona", "paris", "amsterdam", "berlin"] }
    - { name: "us", keywords: ["new york", "nyc", "san francisco", "bay area"] }
  geo_block: ["bangalore", "singapore"]

# How often you may apply to one company.
limits:
  max_apps_per_company: 2
  window_days: 90
  reapply_gap_days: 14
  blocked_companies: []   # companies to never apply to (current employer, live interview, ...)
  company_rules: {}       # e.g. { examplecorp: { max_apps: 1, window_days: 120 } }

cv:
  tex: "cv/cv.tex"        # your CV source, built from cv/template.tex during onboarding
  city_variants: true     # build one CV per target city ("Relocating to {city}")

# Things that must never appear in anything the agent writes (private names, clients, numbers).
forbidden:
  names: []
  customers: []
  amounts: []
  phrases: []

# Fields the agent always leaves for you.
never_fill:
  - legal, arbitration or export-control acknowledgements
  - certify-this-is-true checkboxes
  - consent and marketing opt-in checkboxes
  - video or voice recordings

submit:
  auto_submit_no_essay: false   # true: the agent may submit no-essay forms after review and your "yes" per batch
  batch_size: 10
---

# About me

Write a short, factual summary the agent can draw on.
Every claim the agent makes in an answer must trace back to this section, your CV, or answers/.

- Built an internal tool at Example Labs that cut report preparation from two days to two hours.
- Final-year project: a retrieval system over 40,000 support tickets, evaluated on a held-out split.

# Voice

How you write. Paste two or three sentences you wrote yourself, and list words you never use.

- Plain words, short sentences, first person.
- Never: "passionate", "leverage", "synergy".
