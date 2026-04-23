# GroupMixer SEO guides IA plan

_Date: 2026-04-23_

## Decision summary

GroupMixer should treat practical guide pages as the main next SEO lane.

We are **not** deleting the existing tool landing pages, but we are also **not** treating many near-keyword-clone landing pages as the main growth bet anymore.

The current strategy is:

- keep the homepage and existing tool landing pages live
- let the homepage and core tool pages carry direct tool intent
- add a new guide layer that captures richer workflow/use-case intent
- connect those guides back into the tool cleanly

## Chosen URL structure

Chosen pattern:

- `/guides/<slug>`

Examples:

- `/guides/avoid-repeat-pairings-in-workshops`
- `/guides/run-speed-networking-rounds`
- `/guides/make-balanced-student-groups`

## Why `/guides/` over `/use-cases/`

`/guides/` is the better default because it signals:

- practical help
- how-to intent
- playbook-style content
- broader search fit beyond narrow audience labels

`/use-cases/` is still a possible future subsection name inside navigation or page copy, but the canonical SEO surface should start with `/guides/`.

## What these pages are

These pages should feel like:

- product-adjacent playbooks
- practical workflow documentation
- decision help for real grouping problems

They should **not** feel like:

- generic marketing blog posts
- thin keyword pages
- copies of the tool landing pages with a few wording changes

## What the guide lane is trying to capture

The guide lane should target problems where GroupMixer has real product advantages over simple randomizers, especially:

- repeated rounds
- avoiding repeat pairings
- balancing by attributes
- keeping people together or apart
- classroom and workshop facilitation workflows
- the difference between simple random grouping and constraint-aware grouping

## Guardrails

- Do not create thin guide pages that differ only by a keyword swap.
- Do not make the guide lane a generic blog.
- Do not fork the tool UI per guide page.
- Do not prefill the tool by default just to create an example.
- Each guide must have a clear user problem and a clear route into the relevant tool flow.

## First topic set: ranked priority

### 1. `/guides/avoid-repeat-pairings-in-workshops`

**Working title:**
How to avoid repeat pairings in workshops

**Why first:**

- directly maps to a real product differentiator
- clearly stronger than a generic randomizer
- useful for facilitators, trainings, cohort programs, and repeated breakouts
- easy to connect back to multi-session + avoid-repeat setup in GroupMixer

**Primary query intent:**

- avoid repeat pairings in workshops
- workshop groups without repeats
- rotate workshop groups without same pairs

**Main tool tie-in:**

- homepage tool for simple setup
- advanced options for multiple sessions + avoid repeat pairings

---

### 2. `/guides/run-speed-networking-rounds`

**Working title:**
How to run speed networking rounds without repeat conversations

**Why second:**

- strong event/workshop query intent
- naturally showcases repeated-round optimization
- aligns with an existing high-value tool page
- good candidate for links from `/speed-networking-generator`

**Primary query intent:**

- how to run speed networking rounds
- speed networking without repeat pairs
- networking round generator / rotation planning

**Main tool tie-in:**

- `/speed-networking-generator`
- multi-session setup with avoid-repeat pairings

---

### 3. `/guides/make-balanced-student-groups`

**Working title:**
How to make balanced student groups

**Why third:**

- teacher/classroom intent is one of the clearest user segments
- lets us explain when balancing matters more than pure randomness
- useful entry point for CSV attributes, skill balancing, and together/apart rules

**Primary query intent:**

- make balanced student groups
- balanced classroom groups
- group students fairly

**Main tool tie-in:**

- `/student-group-generator`
- CSV/attribute balancing + simple classroom workflows

---

### 4. `/guides/random-vs-balanced-vs-constrained-groups`

**Working title:**
Random groups vs balanced groups vs constrained groups

**Why fourth:**

- great explanation page for the product model itself
- gives a strong internal-link hub for other guides and tool pages
- helps users understand when the simple setup is enough and when the scenario editor matters

**Primary query intent:**

- random vs balanced groups
- group generator with constraints vs randomizer
- when to use balanced grouping

**Main tool tie-in:**

- homepage
- `/random-group-generator`
- `/group-generator-with-constraints`
- scenario editor handoff explanation

---

### 5. `/guides/split-a-class-into-fair-groups`

**Working title:**
How to split a class into fair groups

**Why fifth:**

- strong classroom phrasing
- overlaps with student-group intent, but in a more natural-language way
- can perform well if search behavior is more question-like than tool-like

**Primary query intent:**

- split a class into fair groups
- divide students into fair groups
- fair classroom grouping

**Main tool tie-in:**

- `/student-group-generator`
- simple roster input + optional balancing

## Recommended execution order

1. `avoid-repeat-pairings-in-workshops`
2. `run-speed-networking-rounds`
3. `make-balanced-student-groups`
4. `random-vs-balanced-vs-constrained-groups`
5. `split-a-class-into-fair-groups`

## Page-shape recommendation for the first guide

The first guide should use this default structure:

1. problem statement
2. why simple randomizers fail here
3. concrete example
4. recommended GroupMixer setup
5. optional advanced setup notes
6. sample output / screenshot / workflow image
7. CTA into the tool
8. related guides

This is intentionally close to documentation/playbook content, not a generic blog format.

## What not to do next

Do **not** spend the next batch of effort on:

- broad rewrites of every existing landing page
- adding many more near-synonym tool pages
- creating guide pages without a clear tool tie-in

## Success criteria for this IA decision

This todo is considered satisfied when:

- `/guides/` is the chosen and documented URL pattern
- the first 3–5 guide topics are prioritized in rank order
- future guide work can reference this document as the source of truth
