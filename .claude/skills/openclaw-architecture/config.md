# Config Architecture

## Scope

This document explains configuration as OpenClaw's declarative control plane.

## Role In The System

Configuration defines runtime behavior for:
- Gateway and auth posture.
- Agent defaults and per-agent overrides.
- Tool policy and sandbox policy.
- Channels, plugins, sessions, and automation.

## Core Mental Model

Think of config as:
- Source of truth for operator intent.
- Input to validation and normalization.
- Runtime contract between layers.

## High-Level Lifecycle

1. Load raw config inputs.
2. Resolve composition features (includes/env references).
3. Validate schema and compatibility.
4. Apply defaults and normalization.
5. Publish effective runtime config.

## Architectural Principles

- Fail closed on invalid or unsafe configuration.
- Keep default behavior explicit and predictable.
- Separate static config from runtime state.
- Preserve backward compatibility through structured migration.

## Common Failure Patterns

- Invalid schema shape after upgrades.
- Legacy key usage after migration windows.
- Policy conflict between global and local overrides.
- Environment variable expectations not met at runtime.

## When To Go Deeper

Go to code-level details when debugging:
- Exact precedence behavior for conflicting values.
- Validation errors from specific fields.
- Migration behavior for historical config layouts.
