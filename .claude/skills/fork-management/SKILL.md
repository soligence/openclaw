---
name: fork-management
description: High-level guidance for maintaining a long-lived OpenClaw fork while syncing upstream safely and preserving fork-specific overlays.
---

# Fork Management

Use this skill for high-level fork sync strategy and risk control.

## Reality Check First

Treat repository state as dynamic, not assumed.

Before recommending an approach, first determine:
- Upstream ahead/behind counts vs fork `main`.
- Time since last sync point (or release tag delta).
- Where local fork commits live (overlay-only vs core runtime files).

Do not assume "small divergence" without measuring current git state.

## Core Model

Manage the fork as two layers:
- Upstream layer: adopt quickly and with minimal local divergence.
- Overlay layer: isolate local custom behavior from upstream churn.

## Sync Principles

1. Sync on disposable branches.
2. Promote only after validation gates pass.
3. Keep fork delta small and explicit.
4. Prefer overlay files over upstream file edits for local behavior.

## Strategy Matrix

Choose strategy based on measured divergence and risk:

- Full upstream sync branch (default for medium/large divergence):
  - Use when upstream gap is substantial, spans multiple releases, or touches core runtime/security paths.
  - This is the preferred path for long-term correctness.

- Selective pull/cherry-pick (exception path):
  - Use only for urgent short-term patches (for example critical hotfix windows).
  - Requires a planned later full sync to eliminate drift.

- No sync:
  - Use only when there is an explicit freeze window or a known blocking incompatibility.
  - Must document freeze reason and re-evaluation trigger.

## Conflict Heuristic

- Core runtime/app code: prefer upstream by default.
- Fork-only overlays/scripts: preserve fork intent.
- Shared metadata files: merge intentionally and keep changes minimal.

## Validation Gates

- Build and quality checks.
- Runtime health checks for your deployment shape.
- Channel/provider startup sanity.

## Promotion Criteria

Promote sync branch only when:
- Validation gates pass.
- Fork-specific overlays still express intended behavior.
- No unresolved security/runtime regressions are present.

If any fail, hold promotion and fix forward on the sync branch.

## Output Pattern

1. Explain layering decision.
2. Explain merge/promotion risk.
3. Explain validation requirement.
4. Recommend safest next step.
