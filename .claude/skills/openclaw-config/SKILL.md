---
name: openclaw-config
description: High-level OpenClaw configuration architecture guide. Use when reasoning about config layering, validation, and runtime control boundaries.
---

# OpenClaw Config

## Purpose

Use this skill for architectural understanding of OpenClaw configuration.

## Core Role

Configuration is the declarative control plane that sets:
- Runtime behavior
- Security posture
- Tool and sandbox policy
- Agent, channel, and plugin behavior

## High-Level Lifecycle

1. Read and compose config inputs.
2. Resolve environment-dependent values.
3. Validate and normalize.
4. Apply defaults and runtime-level interpretation.
5. Expose effective config to active subsystems.

## Design Principles

- Favor explicitness over hidden behavior.
- Fail safely on invalid or risky config.
- Keep compatibility through migration paths.

## Architectural Tradeoffs

- Flexible override systems increase power and complexity.
- Strong validation improves safety but raises migration pressure.

## When To Go Deeper

Switch to code-level investigation for:
- Exact precedence between conflicting values.
- Specific validation/migration errors.
- Runtime reload and override edge cases.
