# Gateway Architecture

## Overview

The Gateway is OpenClaw's central server component - a WebSocket/HTTP server that handles authentication, session management, plugin loading, and channel startup. Default port: **18789**.

## Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway Server                              │
│  server.impl.ts → startGatewayServer()                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   Auth      │  │  Sessions   │  │  Config Hot-Reload       │ │
│  │  Layer      │  │  Manager    │  │  (config-reload.ts)      │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │  Plugins    │  │  Channels   │  │  Gateway Methods         │ │
│  │  Loader     │  │  Manager    │  │  (WebSocket RPC)         │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │  Cron       │  │  Discovery  │  │  HTTP Endpoints          │ │
│  │  Service    │  │  (mDNS)     │  │  (OpenAI compat, etc.)   │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication

### Auth Modes

| Mode | Description | Config |
|------|-------------|--------|
| `none` | No authentication (local dev only) | Default when no token/password set |
| `token` | Bearer token authentication | `gateway.auth.token` or `OPENCLAW_GATEWAY_TOKEN` |
| `password` | Password authentication | `gateway.auth.password` or `OPENCLAW_GATEWAY_PASSWORD` |
| `tailscale` | Tailscale identity verification | `gateway.auth.allowTailscale: true` |
| `trusted-proxy` | Proxy-based identity (Nginx, Cloudflare, etc.) | `gateway.auth.trustedProxy` config |

### Auth Resolution Flow

Auth mode is resolved in `resolveGatewayAuth()` with the following priority:

1. Explicit `authConfig.mode` (if set in config)
2. Password present → `"password"` mode
3. Token present → `"token"` mode
4. Otherwise → `"none"` mode

### Authorization Flow

Authorization in `authorizeGatewayConnect()` proceeds through these steps:

1. **Trusted-proxy check** — if mode is `"trusted-proxy"`, delegate to the trusted proxy authorizer immediately
2. **Rate limit check** — if a limiter is configured and the IP is blocked, reject with `rateLimited: true`
3. **Tailscale identity** — if `allowTailscale` is enabled, attempt Tailscale user verification; if it succeeds, authorize with method `"tailscale"`
4. **Token/password verification** — verify against the configured credential based on the auth mode

## Bind Modes

| Mode | Address | Use Case |
|------|---------|----------|
| `loopback` | 127.0.0.1 | Local-only access |
| `lan` | 0.0.0.0 | LAN access |
| `tailnet` | 100.64.x.x | Tailscale-only |
| `auto` | Prefer loopback | Default |

## HTTP Endpoints

### OpenAI-Compatible API

```
POST /v1/chat/completions    # Chat completions (OpenAI format)
POST /v1/responses           # OpenResponses API
```

These endpoints are enabled via `gateway.http.endpoints.chatCompletions.enabled` and `gateway.http.endpoints.responses.enabled` in config.

### Health & Discovery

```
GET /health                  # Health check
GET /discovery               # Service discovery (mDNS)
```

## WebSocket Protocol

### Connection

Clients connect via WebSocket to the gateway port and send a `connect` method with auth credentials (token or password). The gateway authenticates the connection and establishes a persistent session.

### Gateway Methods

Located in `server-methods/` directory:
- `agent.ts` - Agent operations
- `chat.ts` - Chat/conversation management
- `config.ts` - Config operations
- `sessions.ts` - Session management
- `nodes.ts` - Remote node management
- `exec-approval.ts` - Tool execution approval

### Method Listing

Gateway events include: `connect`, `disconnect`, `agent.run`, `agent.stop`, `chat.send`, `chat.history`, `config.get`, `config.patch`, `session.list`, `session.get`, and more. The full list is exported from `server-methods-list.ts`.

## Startup Sequence

The gateway starts via `startGatewayServer()` in `server.impl.ts`:

1. **Load and migrate config** — read the config file snapshot
2. **Load plugins** — discover and load all gateway plugins
3. **Start channel manager** — create the channel manager from config
4. **Start HTTP/WS server** — bind HTTP server to the configured port
5. **Attach WebSocket handlers** — wire up gateway method dispatchers
6. **Start sidecars** — launch cron service, mDNS discovery, maintenance tasks
7. **Fire `gateway_start` hook** — notify all registered hook handlers

## Config Hot-Reload

The gateway supports live config reloading without restart. The config reloader (`config-reload.ts`) watches the config file for changes, validates the new config, applies the delta to the running gateway, and notifies connected clients.

Reload triggers:
- File system watch on `~/.openclaw/openclaw.json`
- WebSocket method: `config.reload`
- CLI: `openclaw config reload`

## Rate Limiting

Auth rate limiting (`auth-rate-limit.ts`) blocks IPs after repeated failed authentication attempts. Defaults: 5 max failed attempts in a 1-minute window, with a 5-minute block duration.

## Key Files

| File | Purpose |
|------|---------|
| `server.impl.ts` | Main server startup |
| `server.ts` | Exports and types |
| `auth.ts` | Authentication logic |
| `auth-rate-limit.ts` | Rate limiting |
| `config-reload.ts` | Hot-reload handling |
| `server-channels.ts` | Channel management |
| `server-methods.ts` | Core RPC handlers |
| `server-plugins.ts` | Plugin loading |
| `server-http.ts` | HTTP endpoint handling |
| `server-ws-runtime.ts` | WebSocket runtime |

## Control UI

Optional browser-based management interface, enabled via `gateway.controlUi.enabled` in config. Access at `http://localhost:18789/` when enabled.
