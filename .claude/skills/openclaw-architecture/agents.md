# Agents Architecture

## Scope

This document explains the agent subsystem at a design level.

## Role In The System

Agents are OpenClaw's decision and execution layer.

Core responsibilities:
- Interpret user intent in session context.
- Build model input from policy, memory, and conversation state.
- Decide whether to call tools and how to sequence them.
- Produce user-facing output or delegated actions.

## Agent Lifecycle

High-level lifecycle per turn:
1. Session context is resolved.
2. Effective policy is computed (global + agent + context).
3. Model input is assembled.
4. Agent executes a think/act loop (model + tools).
5. Results are persisted back to session state.
6. Outbound delivery is routed through channel surfaces.

## Control Boundaries

Agent behavior is constrained by:
- Tool policy and allow/deny layers.
- Sandbox/runtime execution limits.
- Per-agent model/provider settings.
- Session scope and compaction behavior.

## Design Tradeoffs

- Tighter policy: safer but less flexible.
- Larger context: better continuity but higher cost/latency.
- More automation: faster operations but stronger guardrails needed.

## Common Architectural Failure Modes

- Policy mismatch: desired tool unavailable at runtime.
- Session mismatch: actions performed in wrong context scope.
- Execution mismatch: host vs sandbox assumptions diverge.
- Routing mismatch: agent output generated but not delivered as intended.

## When To Go Deeper

Move to code-level analysis when you need:
- Exact tool-policy resolution order in a failing case.
- Concrete session key derivation for a specific message.
- Why a specific turn used a model/tool unexpectedly.
