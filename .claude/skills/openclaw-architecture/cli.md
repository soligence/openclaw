# CLI Architecture

## Scope

This document explains the CLI as a system interface, not a command reference.

## Role In The System

The CLI is the operator control surface for:
- Local runtime management.
- Remote gateway interaction.
- Diagnostics and operational workflows.

## High-Level Structure

The CLI has three conceptual layers:
1. Command surface: user-facing command groups and options.
2. Execution layer: local command handlers or remote RPC calls.
3. Presentation layer: human-readable output and status signaling.

## Interaction Modes

- Local mode: commands act directly on local process/files.
- Remote mode: commands become typed calls to the gateway.

The CLI is primarily a control plane and observability tool, not the business logic owner.

## Design Priorities

- Predictable command behavior across environments.
- Safe defaults for destructive or high-impact operations.
- Clear diagnostics when runtime state is unhealthy.

## Common Failure Boundaries

- Auth/transport mismatch in remote calls.
- Config/runtime drift between CLI assumptions and gateway state.
- Environment-specific shell/path behavior differences.

## When To Go Deeper

Use code-level inspection for:
- Argument parsing edge cases.
- Specific command registration issues.
- Output formatting or paging defects.
