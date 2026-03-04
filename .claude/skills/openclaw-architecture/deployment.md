# Deployment Architecture

## Scope

This document covers deployment topology and runtime boundary decisions.

## Primary Deployment Shapes

- Host-native gateway runtime.
- Containerized gateway runtime.

Each shape changes operational assumptions for filesystem access, sandbox behavior, and dependency availability.

## Key Boundary Decisions

- Where gateway process runs.
- Where tool execution runs.
- How persistent state is mounted and backed up.
- How network exposure and trust boundaries are enforced.

## Design Tradeoffs

Host-native:
- Simpler local integration with host tools.
- Lower isolation by default.

Containerized:
- Stronger isolation and reproducibility.
- Additional constraints around nested execution and binary availability.

## Operational Priorities

- Keep state durable and portable.
- Keep security defaults conservative.
- Keep runtime assumptions explicit in config.

## Typical Failure Patterns

- Sandbox mode configured for assumptions that do not match deployment shape.
- Missing binaries/dependencies in container images.
- Volume layout mismatch causing state drift.

## When To Go Deeper

Use code and runtime inspection for:
- Container image/runtime startup failures.
- Sandbox execution path selection.
- State path and permission problems.
