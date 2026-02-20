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
│  - Tool pipeline │  │  - 10 plugin     │  │  - Telegram, WhatsApp    │
│  - Policy chain  │  │    types         │  │  - Discord, Slack, etc.  │
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

## Core Components

| Component | Description |
|-----------|-------------|
| **Gateway** | WebSocket/HTTP server, auth, sessions |
| **Plugins** | Extension system, 10 plugin types |
| **Agents** | Tool pipeline, policy chain, sandbox |
| **Channels** | Messaging integrations, routing |
| **Config** | Settings, validation, hot-reload |
| **CLI** | Commands, TUI, shell completion |

## Key Concepts

### Session Keys
```
agent:<agentId>:<channel>:<chatType>:<peerId>[:thread:<threadId>]
```
Example: `agent:main:telegram:direct:12345678`

### Tool Policy Pipeline
```
profile → byProvider → global → agent → group → sandbox
```
Each layer can allow/deny tools. Sandbox is most restrictive.

### Plugin Types
1. Channel (messaging platforms)
2. Provider (LLM/auth)
3. Tool (agent tools)
4. Memory (exclusive slot)
5. Service (background)
6. CLI (extend commands)
7. Hook (lifecycle events)
8. Command (slash commands)
9. HTTP (routes)
10. Gateway method (WebSocket RPC)

### Config Hierarchy
```
Runtime defaults → Config file → $include → process.env → config.env → Runtime overrides
```

## Quick Reference

### Start/Stop Gateway
```bash
openclaw gateway              # Start
openclaw gateway stop         # Stop
```

### Enable Plugin
```json
{
  "plugins": {
    "entries": {
      "plugin-id": { "enabled": true }
    }
  }
}
```

### Allow Plugin Tools
```json
{
  "tools": {
    "allow": ["group:openclaw", "group:plugins"]
  },
  "agents": {
    "defaults": {
      "sandbox": { "mode": "non-main" }
    }
  }
}
```

### Key Directories
- `~/.openclaw/` - Config, state, extensions
- `~/.openclaw/openclaw.json` - Main config file
- `~/.openclaw/extensions/` - User plugins
- `~/.openclaw/agents/` - Agent state, sessions
