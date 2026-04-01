# Solver Contracts Reference

> Generated from `gm-contracts`. Do not edit by hand. Regenerate with `cargo run -p gm-contracts --bin generate-reference`.

This directory contains generated reference material derived from `gm-contracts`, the transport-neutral semantic source of truth for GroupMixer's public solver interfaces.

## Bootstrap

- title: `GroupMixer solver contracts`
- summary: Static bootstrap for the public solver affordance graph shared by CLI, HTTP, and WASM projections.
- discovery note: The surface is static and self-describing. Start from a top-level operation, then request local help for that operation and follow its related affordances.

## Files

- `operations.md` — operation catalog and local-help graph
- `schemas.md` — schema registry plus per-schema JSON artifacts under `schemas/`
- `errors.md` — public error taxonomy and recovery guidance
- `examples.md` — canonical examples and snippets
- `catalog.json` — machine-readable aggregate export

## Regeneration

```bash
cargo run -p gm-contracts --bin generate-reference
```

## Freshness check

```bash
cargo run -p gm-contracts --bin generate-reference -- --check
```
