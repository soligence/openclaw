---
name: openclaw-mcp
description: High-level MCP integration model for OpenClaw. Use when reasoning about connecting external MCP servers, capability boundaries, and operational tradeoffs.
---

# OpenClaw MCP Integration

Use this skill for high-level MCP architecture and risk reasoning.

## Core Model

MCP integration extends OpenClaw tool capabilities:
1. MCP server definitions are loaded.
2. Remote/local MCP tools are exposed to agents.
3. Existing tool policy and sandbox boundaries still govern execution.

## Transport Tradeoffs

- HTTP transport: decoupled runtime, network-dependent.
- Stdio transport: local-process simplicity, environment-dependent.

## Security Posture

- Treat MCP tools as execution-surface expansion.
- Require explicit policy exposure.
- Align sandbox/runtime mode with where MCP commands execute.
- Keep credentials in managed secrets, not literals.

## Typical Failure Boundaries

- Tools visible but policy-blocked.
- Transport reachable in one environment but not gateway runtime.
- Host/container assumptions mismatch.

## Output Pattern

1. Explain integration boundary.
2. Explain transport + policy tradeoff.
3. Explain deployment risk.
4. Recommend next validation step.
