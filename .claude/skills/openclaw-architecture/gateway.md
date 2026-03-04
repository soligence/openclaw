# Gateway Architecture

## Scope

This document explains the gateway as OpenClaw's central runtime coordinator.

## Role In The System

The gateway is the control and routing hub that:
- Accepts inbound control/message events.
- Applies auth and policy boundaries.
- Coordinates agent execution.
- Manages channels, plugins, and session state.

## High-Level Responsibilities

- Connection lifecycle: local/remote interfaces and request handling.
- Auth and trust enforcement for operators and clients.
- Runtime orchestration for channels, agents, and plugins.
- Health, diagnostics, and controlled reload behavior.

## Startup Model

At a high level:
1. Load effective config.
2. Initialize plugin/runtime registries.
3. Bring up channel and service components.
4. Expose gateway interfaces.
5. Enter steady-state operation with health monitoring.

## Architectural Boundaries

The gateway owns orchestration and policy.
Agents own reasoning.
Channels own transport specifics.
Plugins extend capabilities through defined interfaces.

## Common Failure Boundaries

- Auth mode and origin/trust misconfiguration.
- Plugin/channel initialization incompatibility.
- Runtime reload assumptions that do not match stateful components.

## When To Go Deeper

Move to code-level analysis when diagnosing:
- Specific request/response handler behavior.
- Startup sequencing defects.
- Gateway method registration conflicts.
