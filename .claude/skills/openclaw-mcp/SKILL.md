---
name: openclaw-mcp
description: How to connect MCP servers to OpenClaw using the adapter plugin
---

# OpenClaw MCP Server Management

## Overview

MCP (Model Context Protocol) is a standard for connecting AI agents to external tools and data sources. The `mcp-adapter` plugin lets OpenClaw agents use tools provided by any MCP-compatible server.

## Installation

```bash
openclaw plugins install mcp-adapter
```

## Configuration

Edit `~/.openclaw/openclaw.json`:

### Enable the plugin with MCP servers
```json
{
  "plugins": {
    "entries": {
      "mcp-adapter": {
        "enabled": true,
        "config": {
          "servers": [
            {
              "name": "my-server",
              "transport": "http",
              "url": "https://my-mcp-server.example.com/mcp"
            }
          ]
        }
      }
    }
  }
}
```

### Allow plugin tools (REQUIRED)
```json
{
  "tools": {
    "allow": ["group:openclaw", "group:plugins"]
  }
}
```

### Sandbox mode

When the gateway runs on the host:
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"
      }
    }
  }
}
```

**When the gateway runs in Docker**, set `sandbox.mode: "off"` instead. The container IS the sandbox — `"non-main"` tries Docker-in-Docker which fails with `spawn docker EACCES`. See [deployment.md](openclaw-architecture/deployment.md) for details.

## Server Transport Types

### HTTP (remote server)
```json
{
  "name": "api",
  "transport": "http",
  "url": "https://server.example.com/mcp",
  "headers": {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

### Stdio (local subprocess)
```json
{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-filesystem", "/path"],
  "env": {
    "API_KEY": "${MY_API_KEY}"
  }
}
```

**Docker note:** For stdio transport, the command must be available inside the container. If the gateway runs in Docker, install the MCP server binary in the Docker image or use HTTP transport instead.

## Environment Variables

Use `${VAR_NAME}` syntax in `env` and `headers` to interpolate from environment.
Set variables in `~/.openclaw/.env`.

## Commands

```bash
# Restart gateway after config changes
openclaw gateway stop
openclaw gateway

# Check plugin status
openclaw plugins list

# View logs (useful for debugging MCP connections)
openclaw logs --follow
```

## Troubleshooting

### Tools not showing up to agent
1. Check `tools.allow` includes `"group:plugins"`
2. Check `sandbox.mode` is appropriate (`"non-main"` on host, `"off"` in Docker)
3. Restart gateway after config changes

### Plugin not loading
1. Verify plugin is installed: `openclaw plugins list`
2. Check `plugins.entries.mcp-adapter.enabled: true`
3. Check gateway logs: `openclaw logs --follow`

### MCP connection failing
1. Check server URL is reachable from the gateway (if in Docker, from inside the container)
2. Verify auth headers/tokens if required
3. Check gateway logs for connection errors: `openclaw logs --follow`

### Stdio transport not working in Docker
1. Ensure the command binary is installed in the Docker image
2. Check that the command path is correct for the container environment
3. Consider switching to HTTP transport for containerized deployments

## Tool Naming

Tools are registered with prefix: `{server-name}_{tool-name}`

Example: Server named `command-center` with tool `health` becomes `command-center_health`

Disable prefixing with:
```json
{
  "config": {
    "toolPrefix": false
  }
}
```
