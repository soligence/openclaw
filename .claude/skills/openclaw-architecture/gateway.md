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

```typescript
// auth.ts → resolveGatewayAuth()
function resolveGatewayAuth(params): ResolvedGatewayAuth {
  // Priority: config.mode → password → token → none
  if (authConfig.mode) mode = authConfig.mode;
  else if (password) mode = "password";
  else if (token) mode = "token";
  else mode = "none";
}
```

### Authorization Flow

```typescript
// auth.ts → authorizeGatewayConnect()
async function authorizeGatewayConnect(params): Promise<GatewayAuthResult> {
  // 1. Check trusted-proxy mode first
  if (auth.mode === "trusted-proxy") {
    return authorizeTrustedProxy(params);
  }

  // 2. Rate limit check
  if (limiter && !limiter.check(ip).allowed) {
    return { ok: false, rateLimited: true };
  }

  // 3. Tailscale identity check (if enabled)
  if (auth.allowTailscale) {
    const tailscaleCheck = await resolveVerifiedTailscaleUser(params);
    if (tailscaleCheck.ok) return { ok: true, method: "tailscale" };
  }

  // 4. Token/password verification
  if (auth.mode === "token") return verifyToken();
  if (auth.mode === "password") return verifyPassword();
}
```

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

Enable via config:
```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true },
        "responses": { "enabled": true }
      }
    }
  }
}
```

### Health & Discovery
```
GET /health                  # Health check
GET /discovery               # Service discovery (mDNS)
```

## WebSocket Protocol

### Connection
```javascript
const ws = new WebSocket("ws://localhost:18789");
ws.send(JSON.stringify({
  method: "connect",
  auth: { token: "your-token" }
}));
```

### Gateway Methods
Located in `server-methods/` directory:
- `agent.ts` - Agent operations
- `chat.ts` - Chat/conversation management
- `config.ts` - Config operations
- `sessions.ts` - Session management
- `nodes.ts` - Remote node management
- `exec-approval.ts` - Tool execution approval

### Method Listing
```typescript
// server-methods-list.ts
export const GATEWAY_EVENTS = [
  "connect", "disconnect",
  "agent.run", "agent.stop",
  "chat.send", "chat.history",
  "config.get", "config.patch",
  "session.list", "session.get",
  // ... more methods
];
```

## Startup Sequence

```typescript
// server.impl.ts → startGatewayServer()
async function startGatewayServer(port = 18789): Promise<GatewayServer> {
  // 1. Load and migrate config
  const configSnapshot = await readConfigFileSnapshot();

  // 2. Load plugins
  const plugins = await loadGatewayPlugins(config);

  // 3. Start channel manager
  const channels = createChannelManager(config);

  // 4. Start HTTP/WS server
  const server = await startHttpServer(port);

  // 5. Attach WebSocket handlers
  attachGatewayWsHandlers(server);

  // 6. Start sidecars (cron, discovery, maintenance)
  await startGatewaySidecars();

  // 7. Fire gateway_start hook
  await runGlobalHook("gateway_start", { port });
}
```

## Config Hot-Reload

The gateway supports live config reloading without restart:

```typescript
// config-reload.ts
function startGatewayConfigReloader(params) {
  // Watch config file for changes
  // Validate new config
  // Apply delta to running gateway
  // Notify connected clients
}
```

Reload triggers:
- File system watch on `~/.openclaw/openclaw.json`
- WebSocket method: `config.reload`
- CLI: `openclaw config reload`

## Rate Limiting

```typescript
// auth-rate-limit.ts
const limiter = createAuthRateLimiter({
  maxAttempts: 5,           // Max failed attempts
  windowMs: 60_000,         // 1 minute window
  blockDurationMs: 300_000  // 5 minute block
});
```

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

Optional browser-based management interface:

```json
{
  "gateway": {
    "controlUi": {
      "enabled": true  // Default
    }
  }
}
```

Access at `http://localhost:18789/` when enabled.

## CLI Commands

```bash
openclaw gateway              # Start gateway (default port 18789)
openclaw gateway --port 8080  # Custom port
openclaw gateway stop         # Stop running gateway
openclaw gateway status       # Check gateway status
```
