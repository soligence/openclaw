---
name: openclaw-mcp
description: How to connect MCP servers to OpenClaw using the adapter plugin
---

# OpenClaw MCP Server Management

## Overview

Connect external MCP (Model Context Protocol) servers to OpenClaw using the `openclaw-mcp-adapter` plugin.

## Installation

1. Create the extension directory and install the adapter:
```powershell
mkdir ~/.openclaw/extensions/mcp-adapter
cd ~/.openclaw/extensions/mcp-adapter
npm init -y
npm install openclaw-mcp-adapter
```

2. Copy plugin files to extension root:
```powershell
cp node_modules/openclaw-mcp-adapter/* .
```

## Configuration

Edit `~/.openclaw/openclaw.json`:

### Enable the plugin with MCP servers
```json
{
  "plugins": {
    "entries": {
      "openclaw-mcp-adapter": {
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

### Sandbox mode (if using sandbox)
Use `"mode": "non-main"` to allow plugin tools in main sessions:
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

# View logs
openclaw logs --follow
```

## Troubleshooting

### Tools not showing up to agent
1. Check `tools.allow` includes `"group:plugins"`
2. Check `sandbox.mode` is `"non-main"` (not `"all"`)
3. Restart gateway after config changes

### Plugin not loading
1. Verify `openclaw.plugin.json` exists in extension directory
2. Check `plugins.entries.<id>.enabled: true`
3. Run `openclaw plugins list` to see status

### MCP connection failing
1. Check server URL is reachable
2. Verify auth headers/tokens if required
3. Check gateway logs for connection errors

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
