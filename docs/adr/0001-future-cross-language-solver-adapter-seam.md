# ADR 0001: Future cross-language solver adapter seam

## Status

Accepted as a readiness constraint for the multi-solver refactor.

## Context

GroupMixer's next solver is still expected to be Rust + WASM.
However, the architecture should also leave room for a future solver implementation in another language.

The risk is introducing that future concern too early into the wrong layer, for example by:
- shaping React/store types around transport protocol details
- pushing protobuf or RPC envelopes into the webapp runtime boundary
- forcing in-process Rust engines to look like remote jobs before needed

## Decision

If GroupMixer later adds a non-Rust solver, the cross-language protocol will live **below** the app/runtime boundary and **below** the public app workflow layer.

That means:
- webapp code continues to depend on runtime-owned types
- the runtime boundary continues to expose app-facing semantic operations
- any protobuf / RPC / subprocess protocol is an adapter concern, not a React/store concern

## Consequences

### Positive
- current Rust/WASM work stays simple
- future foreign-language support remains additive
- the app does not become coupled to protocol mechanics prematurely
- in-process and adapter-backed engines can coexist under one higher-level solver registry

### Negative
- some translation/adaptation logic will exist at the lower boundary later
- protocol-specific diagnostics may need explicit projection into shared error/result surfaces

## Rules implied by this ADR

1. Do not introduce protobuf as the main React/store boundary.
2. Do not force all engines to adopt a remote-job lifecycle prematurely.
3. Keep shared contract-safe semantics explicit now:
   - problem definition
   - schedule / assignments
   - validation issues
   - public errors
   - stop reasons
   - capability descriptors
4. Keep engine-specific internal data out of the future shared protocol by default:
   - legacy `State`
   - move-family internals
   - engine-specific debug structs
5. Unsupported capability differences must fail explicitly, not silently degrade.

## Follow-on work

When a foreign-language solver becomes real work, define a dedicated lower-level protocol for:
- solve request / response
- validation response
- progress events
- error envelopes
- capability discovery

At that time, protobuf is a valid candidate.
