# Compliance, Enhancement, and Validation Reference Guide

This guide consolidates the living documents that prove the sandbox experience matches the "Comprehensive Analysis and Enhancement Specifications" brief. Use it as a directory when you need to cite requirements coverage, prioritise renderer uplift work, or plan regression passes.

## Compliance Dossiers

- **`spec-compliance.md`** – High-level status table that maps each specification family to shipped behaviour with code citations. Reach for this when you need a quick yes/no confirmation across onboarding, world generation, progression, and polish systems.【F:docs/spec-compliance.md†L1-L32】
- **`spec-compliance-report.md`** – Narrative coverage audit that describes how the renderer, survival loop, portals, and backend integrations satisfy the brief. It is ideal for auditors who want prose explanations backed by source anchors.【F:docs/spec-compliance-report.md†L1-L42】【F:docs/spec-compliance-report.md†L49-L70】
- **`portals-of-dimension-compliance.md`** – Checklist-level breakdown tying rendering, controls, combat, crafting, portals, and backend sync to specific runtime hooks, including diagnostic logging expectations for smoke tests.【F:docs/portals-of-dimension-compliance.md†L1-L52】【F:docs/portals-of-dimension-compliance.md†L86-L117】
- **`portals-of-dimension-compliance-refresh.md`** – Addendum that captures the latest runtime touchpoints (scene bootstrap, mining/placement flows, survival loops, backend sync) with the exact console signatures QA tooling asserts during regression.【F:docs/portals-of-dimension-compliance-refresh.md†L1-L47】【F:docs/portals-of-dimension-compliance-refresh.md†L60-L101】
- **`portals-of-dimension-spec-fulfilment-2025-05.md`** – May 2025 snapshot mapping each headline pointer from the enhancement brief to the shipped sandbox behaviours, organised by lifecycle stage from onboarding through polish.【F:docs/portals-of-dimension-spec-fulfilment-2025-05.md†L1-L38】【F:docs/portals-of-dimension-spec-fulfilment-2025-05.md†L39-L80】
- **`portals-of-dimension-spec-verification-2026-07.md`** – July 2026 verification audit that reaffirms compliance and highlights the debug instrumentation (e.g., console watchdog strings, spec coverage tests) guarding the implementation.【F:docs/portals-of-dimension-spec-verification-2026-07.md†L1-L33】【F:docs/portals-of-dimension-spec-verification-2026-07.md†L64-L84】

## Enhancement Playbooks

- **`enhancement-plan.md`** – Completed roadmap documenting how the sandbox achieved each enhancement milestone across rendering, controls, combat, crafting, portals, backend, and validation. Use it as a historical record of delivered scope.【F:docs/enhancement-plan.md†L1-L56】【F:docs/enhancement-plan.md†L57-L120】
- **`enhancement-roadmap.md`** – Active checklist that tracks which enhancement tasks are shipped in the sandbox and which remain for the advanced renderer uplift, grouped by system area with citations for parity work.【F:docs/enhancement-roadmap.md†L1-L44】【F:docs/enhancement-roadmap.md†L45-L124】
- **`implementation-plan.md`** – Modernisation plan focusing on bringing the advanced renderer up to sandbox parity, including granular TODOs for rendering, entities, controls, portals, backend, audio, and validation tooling.【F:docs/implementation-plan.md†L1-L32】【F:docs/implementation-plan.md†L33-L108】
- **`portals-of-dimension-enhancement-proof.md`** – Feature proof that enumerates priority requirements (terrain, controls, creatures, crafting, progression, backend) with direct implementation references, great for justification memos.【F:docs/portals-of-dimension-enhancement-proof.md†L1-L35】【F:docs/portals-of-dimension-enhancement-proof.md†L36-L88】
- **`portals-of-dimension-enhancements.md`** – Digest of the live gameplay pipelines (renderer bootstrap, avatar, combat, crafting, portals, backend) for quick onboarding or walkthrough decks.【F:docs/portals-of-dimension-enhancements.md†L1-L36】【F:docs/portals-of-dimension-enhancements.md†L37-L106】

## Validation Toolchain

- **`feature-verification.md`** – Source-backed verification script that walks through rendering, controls, combat, crafting, progression, backend sync, performance, and audio, including manual QA snapshots and automation notes.【F:docs/feature-verification.md†L1-L68】【F:docs/feature-verification.md†L97-L148】
- **`validation-matrix.md`** – Tabular matrix linking requirement IDs to validation methods, success criteria, and scenarios across visuals, UI, gameplay, persistence, audio, performance, security, and upcoming coverage gaps.【F:docs/validation-matrix.md†L1-L69】【F:docs/validation-matrix.md†L70-L151】
- **`portals-of-dimension-verification.md`** – Follow-up audit that maps spec requirements to implementation files and highlights automation hooks and debug helpers that testers can invoke directly.【F:docs/portals-of-dimension-verification.md†L1-L40】【F:docs/portals-of-dimension-verification.md†L67-L98】
- **`spec-brief-crosswalk.md`** – Crosswalk that aligns each specification pointer with the exact runtime functionality, reinforcing the shared language between design briefs and shipped systems.【F:docs/spec-brief-crosswalk.md†L1-L32】

Keep this guide in sync whenever new compliance snapshots, enhancement trackers, or validation matrices are introduced so reviewers always have a single starting point for deeper dives.
