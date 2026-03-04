# Plugins Architecture

## Scope

This document describes plugins as the extension model for OpenClaw.

## Role In The System

Plugins extend OpenClaw without changing core runtime behavior.

They can add or modify capabilities such as:
- Channels
- Tools
- Providers
- Services
- Hooks
- Commands
- Gateway or HTTP integrations

## Extension Model

A plugin registers capabilities through the plugin API.
The gateway composes these registrations into the active runtime.

## Architectural Principles

- Keep core orchestration in gateway/agent layers.
- Keep plugin contracts stable and explicit.
- Treat plugin code as part of runtime trust boundary decisions.

## Compatibility Concerns

- Config schema compatibility per plugin.
- Tool policy exposure after plugin tool registration.
- Runtime dependency requirements (binary/network/env).
- Version compatibility with core plugin API surface.

## Governance Concepts

- Global enable/disable and allow/deny controls.
- Per-plugin configuration entries.
- Plugin slotting for exclusive capability classes when applicable.

## Typical Failure Patterns

- Plugin discovered but not effectively enabled.
- Tool appears registered but blocked by policy.
- Plugin config valid syntactically but incompatible operationally.

## When To Go Deeper

Go code-level when debugging:
- Registration lifecycle ordering.
- Hook side effects.
- Plugin-specific config parsing or runtime behavior.
