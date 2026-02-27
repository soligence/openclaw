---
name: openclaw-architecture
description: OpenClaw system architecture overview - gateway, plugins, agents, channels
---

# OpenClaw System Architecture

## Overview

OpenClaw is a self-hosted AI assistant gateway that connects LLM agents to messaging channels (Telegram, WhatsApp, Discord, etc.) with a plugin-based architecture.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                   │
│         openclaw [gateway|agent|config|plugins|channels|...]            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway Server                                 │
│  - WebSocket + HTTP server (port 18789 default)                         │
│  - Authentication (token, password, tailscale, trusted-proxy)           │
│  - Session management, config hot-reload                                │
│  - Plugin loading, channel startup                                      │
└──────────┬──────────────────────┬──────────────────────┬───────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│  Agent Runtime   │  │  Plugin System   │  │   Channel Integrations   │
│  - Tool pipeline │  │  - 10 register   │  │  - Telegram, WhatsApp    │
│  - Policy chain  │  │    methods       │  │  - Discord, Slack, etc.  │
│  - Sandbox       │  │  - Discovery     │  │  - Message routing       │
│  - LLM providers │  │  - Lifecycle     │  │  - Session keys          │
└──────────────────┘  └──────────────────┘  └──────────────────────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │    Config System        │
                    │  ~/.openclaw/openclaw.json │
                    │  - Zod validation       │
                    │  - Hot reload           │
                    │  - $include, ${ENV}     │
                    └─────────────────────────┘
```

## Documentation Map

| Component | When to Read | File |
|-----------|-------------|------|
| **Gateway** | Server architecture, auth, WebSocket, startup | [gateway.md](gateway.md) |
| **Agents** | Tool pipeline, sandbox, LLM providers, failover | [agents.md](agents.md) |
| **Channels** | Message routing, channel plugins, adapters | [channels.md](channels.md) |
| **Plugins** | Extension system, registration API, hooks | [plugins.md](plugins.md) |
| **CLI** | Commands, TUI, shell completion | [cli.md](cli.md) |
| **Config** | Schema, validation, hot-reload, $include | [config.md](config.md) |
| **Sessions** | Session lifecycle, heartbeat, cron jobs | [sessions.md](sessions.md) |
| **Deployment** | Docker setup, named volumes, sandbox config | [deployment.md](deployment.md) |

## Key Concepts

### Session Keys
```
agent:<agentId>:<channel>:<chatType>:<peerId>[:thread:<threadId>]
```
Example: `agent:main:telegram:direct:12345678` → see [sessions.md](sessions.md)

### Tool Policy Pipeline
```
profile → byProvider → global → agent → group → sandbox
```
Each layer can allow/deny tools. Sandbox is most restrictive. → see [agents.md](agents.md)

### Plugin Registration Methods
OpenClaw has **1 exclusive plugin kind** (`"memory"` — only one active at a time) and **10 registration methods** that any plugin can use simultaneously:

1. `registerChannel` (messaging platforms)
2. `registerProvider` (LLM/auth)
3. `registerTool` (agent tools)
4. `registerService` (background)
5. `registerCli` (extend commands)
6. `registerHook` (lifecycle events)
7. `registerCommand` (slash commands)
8. `registerHttpHandler` / `registerHttpRoute` (HTTP routes)
9. `registerGatewayMethod` (WebSocket RPC)

A single plugin can call multiple registration methods. → see [plugins.md](plugins.md)

### Config Hierarchy
```
Runtime defaults → Config file → $include → process.env → config.env → Runtime overrides
```
→ see [config.md](config.md)

### Key Directories
- `~/.openclaw/` — Config, state, extensions
- `~/.openclaw/openclaw.json` — Main config file
- `~/.openclaw/extensions/` — User plugins
- `~/.openclaw/agents/` — Agent state, sessions
