---
name: openclaw-architecture
description: High-level OpenClaw architecture guide. Use when you need system understanding, component boundaries, or design-level reasoning across gateway, agents, channels, plugins, sessions, config, and deployment.
---

# OpenClaw Architecture

Use this skill for design-level system understanding.

Keep answers high-level:
- Explain responsibilities and boundaries first.
- Explain cross-component interactions second.
- Drop to code only when explicitly requested.

## Core Model

OpenClaw is a gateway-centered system:
- Gateway: orchestrates runtime and policy boundaries.
- Agents: reasoning and tool execution.
- Channels: inbound/outbound transport adapters.
- Plugins: extension mechanism for capabilities.
- Sessions: context continuity boundaries.
- Config: declarative control plane.
- Deployment: host/container operating shape.

## Read-By-Need Map

- Gateway: [gateway.md](gateway.md)
- Agents: [agents.md](agents.md)
- Channels: [channels.md](channels.md)
- Plugins: [plugins.md](plugins.md)
- Sessions: [sessions.md](sessions.md)
- Config: [config.md](config.md)
- CLI: [cli.md](cli.md)
- Deployment: [deployment.md](deployment.md)

## Output Pattern

1. State which layer owns the behavior.
2. State expected interaction with adjacent layers.
3. State likely tradeoffs/failure boundary.
4. Suggest next validation step.
