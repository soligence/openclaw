# Channels Architecture

## Scope

This document describes how channel integrations fit the OpenClaw system.

## Role In The System

Channels are transport adapters between external messaging surfaces and the gateway.

Each channel integration provides:
- Inbound normalization: convert provider-specific payloads into OpenClaw message events.
- Outbound delivery: send agent output back with channel-specific constraints.
- Identity mapping: represent senders, chats, groups, and threads consistently.

## Core Flow

1. External message arrives on a channel integration.
2. Channel adapter normalizes metadata and content.
3. Routing resolves target agent + session scope.
4. Agent turn executes.
5. Channel adapter delivers response (text/media/actions) with channel semantics.

## Architectural Concerns

- Surface differences: DM vs group vs thread behavior varies by platform.
- Capability differences: media, reactions, edit support, and limits differ.
- Reliability: retries, idempotency, and duplicate-event handling matter.
- Security: allowlists and sender trust boundaries differ across channels.

## Design Principles

- Keep channel adapters thin and deterministic.
- Centralize reasoning and policy in agent/gateway layers.
- Treat provider metadata as untrusted unless explicitly validated.

## Typical Failure Patterns

- Routing drift across DM/group/thread scopes.
- Outbound payload valid in one channel but invalid in another.
- Identity/session fragmentation across channel account boundaries.

## When To Go Deeper

Go to code-level details when diagnosing:
- A channel-specific delivery bug.
- Provider webhook/auth behavior.
- Per-channel parsing or normalization edge cases.
