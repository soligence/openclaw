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

## Docker Deployment (Dan's Setup)

When running the gateway inside Docker via `docker-compose.yml`, there are two interacting concepts that are easy to confuse:

### Gateway Deployment vs Agent Sandbox

| Concept | What it controls | Config |
|---------|-----------------|--------|
| **Gateway deployment** | Where the gateway process runs (host vs container) | `docker-compose.yml` |
| **Agent sandbox mode** | Where agent tool execution happens | `agents.defaults.sandbox.mode` |

### Sandbox Mode + Docker = Docker-in-Docker Problem

The sandbox mode (`agents.defaults.sandbox.mode`) controls whether agent sessions spawn Docker containers for tool isolation:

| Mode | Behavior | Docker-in-Docker needed? |
|------|----------|--------------------------|
| `"off"` | All tools run directly in the gateway process | No |
| `"non-main"` (default) | Non-main sessions (channels, groups, cron jobs) spawn Docker containers | Yes |
| `"all"` | Every session spawns a Docker container | Yes |

**When the gateway itself runs in Docker** (our setup), `"non-main"` or `"all"` causes isolated sessions to try spawning Docker containers from inside a container. This fails with `spawn docker EACCES` because the container has no access to the host's Docker daemon.

### The Fix

Set `sandbox.mode: "off"` in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  }
}
```

**Why this is correct and secure:** The Docker container IS the sandbox. Setting `"off"` means tools run inside the existing container — which is already isolated from the host. Mounting the Docker socket (`/var/run/docker.sock`) as an alternative is worse because it gives the container root-level access to the host.

### What This Affects

- **Main DM sessions**: Work fine with any sandbox mode (they're "main")
- **Telegram/channel sessions**: Affected by `"non-main"` — will fail in Docker
- **Isolated cron jobs**: Session key is `cron:<jobId>`, which is non-main — will fail in Docker
- **Subagent sessions**: Also non-main — will fail in Docker

### Related Config

- `gateway.mode: "local"` — tells OpenClaw the gateway runs directly (even inside Docker)
- Cron job errors trigger exponential backoff (30s, 1m, 5m, 15m, 60m) — force-run with `openclaw cron run <jobId>` to reset

### Known Issues

- GitHub #5339: Telegram cron announce delivery can silently fail
- GitHub #13420: Cron announce delivery may ignore configured channel

## Sessions: How Conversations Work

OpenClaw has two types of sessions that behave very differently:

### Main Session (persistent, resets daily)

- **Key:** `agent:main:main`
- **What goes here:** All Telegram DMs + heartbeat polls share this one conversation
- **Context:** Accumulates throughout the day — each new message sees all prior messages
- **Reset:** Daily at 4:00 AM gateway local time (UTC inside Docker = 11 PM ET)
- **Manual reset:** Send `/new` in Telegram to force a fresh session
- **File:** `~/.openclaw/agents/main/sessions/<sessionId>.jsonl`

### Isolated Cron Session (fresh every run)

- **Key:** `cron:<jobId>:run:<random-uuid>`
- **What goes here:** Each cron job run gets its own brand new session
- **Context:** Zero conversation history — only sees system prompt + workspace files + cron message
- **Cannot see:** Telegram chats, prior briefings, or any main session context
- **Implication:** Quality depends on what the agent finds in workspace files each run (inconsistent)

### Session Lifecycle

```
11 PM ET (4 AM UTC)  → Main session resets (new session ID)
5 AM ET              → Cron daily briefing runs (fresh isolated session)
7-8 AM ET            → First heartbeat of the day (main session)
Throughout day       → Telegram DMs accumulate in main session
11 PM ET             → Session resets again
```

### Workspace Files = The Agent's Memory Between Sessions

Since isolated cron sessions have no conversation context, the agent relies entirely on workspace files for continuity:

- `AGENTS.md` — instructions for how to behave
- `SOUL.md` — personality/identity
- `USER.md` — info about Dan
- `MEMORY.md` — long-term curated memory (only loaded in main session for privacy)
- `TODO.md` — task list (critical for daily briefing quality)
- `memory/YYYY-MM-DD.md` — daily notes

**If TODO.md is empty, the daily briefing will be generic.** The agent can't remember what it read yesterday because each cron run is a blank slate. Keep workspace files populated.

## Heartbeat vs Cron Jobs

Two different mechanisms for proactive agent behavior:

### Heartbeat

- Periodic pulse injected into the **main session** (same conversation as Telegram DMs)
- Default: every 30 minutes
- Agent checks HEARTBEAT.md and decides whether to act or reply HEARTBEAT_OK
- **Use for:** Checking email, calendar, notifications — anything that benefits from main session context
- **Cost warning:** Each heartbeat is an API call (~$0.02-0.025). At 30-min intervals that's 48 calls/day

### Cron Job

- Scheduled task that runs in a **separate fresh session** (or optionally main session)
- Fires at exact times (cron expression)
- Output delivered via announce (Telegram), webhook, or none
- **Use for:** Daily briefings, weekly summaries, exact-schedule tasks

### Configuration

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "24h",
        "activeHours": {
          "start": "08:00",
          "end": "09:00",
          "timezone": "America/New_York"
        }
      }
    }
  }
}
```

- `every`: Interval — `"30m"`, `"1h"`, `"24h"`, or `"0m"` to disable
- `activeHours.start/end`: Window when heartbeats can fire (HH:MM format)
- `activeHours.timezone`: IANA timezone (falls back to host timezone)

**Current setup:** Once daily at 8-9 AM ET. Increase frequency when email/calendar integrations are connected.

### Cost Optimization

| Heartbeat interval | Calls/day | Approx cost/day | When to use |
|-------------------|-----------|-----------------|-------------|
| `"30m"` | 48 | ~$1.00-1.20 | Email + calendar connected, need real-time checks |
| `"2h"` | 12 | ~$0.25-0.30 | Some integrations, periodic checks sufficient |
| `"24h"` | 1 | ~$0.02-0.03 | No integrations yet (current setup) |
| `"0m"` | 0 | $0 | Disabled — rely on cron + direct messages only |

## CLI Commands

```bash
openclaw gateway              # Start gateway (default port 18789)
openclaw gateway --port 8080  # Custom port
openclaw gateway stop         # Stop running gateway
openclaw gateway status       # Check gateway status
```
