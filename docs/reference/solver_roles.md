# Solver Roles

This document defines the current human-facing role of each backend solver.

## solver1 = legacy-solver

The original legacy solver family.

- General-purpose historical solver
- Kept mainly for legacy coverage and comparison
- Not the main direction for new architecture work

## solver3 = solver

The main general solver core.

- Designed to handle the full GroupMixer problem space
- Supports arbitrary constraints and broader real-world cases
- The intended long-term primary solver surface

## solver4 = sgp-searcher

A pure Social Golfer Problem search-oriented solver.

- Focused on SGP-style search behavior
- More paper/reference-oriented than production-central
- Useful as a research baseline and source of ideas

## solver5 = sgp-constructor

The exact pure-SGP construction portfolio.

- Builds exact SGP constructions when known constructive methods exist
- Best thought of as a constructor, not a general optimizer
- Used as a building-block source for stronger SGP pipelines

## solver6 = extended-sgp

The hybrid pure-SGP solver for harder extended/impossible SGP cases.

- Uses solver5 exact constructions as building blocks
- Synthesizes strong seeds/structures beyond the exact frontier
- Applies repeat-minimizing optimization for overfull or otherwise non-exact pure-SGP instances
- Still remains pure-SGP scoped rather than a general arbitrary-constraint solver
