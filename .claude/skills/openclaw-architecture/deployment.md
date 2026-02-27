# Docker Deployment

## Overview

The OpenClaw gateway can run inside a Docker container via `docker-compose.yml`. This simplifies deployment but introduces an important interaction between the container and the agent sandbox system.

## Gateway Deployment vs Agent Sandbox

| Concept | What it controls | Config |
|---------|-----------------|--------|
| **Gateway deployment** | Where the gateway process runs (host vs container) | `docker-compose.yml` |
| **Agent sandbox mode** | Where agent tool execution happens | `agents.defaults.sandbox.mode` |

## Sandbox Mode in Docker

The sandbox mode (`agents.defaults.sandbox.mode`) controls whether agent sessions spawn Docker containers for tool isolation:

| Mode | Behavior | Docker-in-Docker needed? |
|------|----------|--------------------------|
| `"off"` | All tools run directly in the gateway process | No |
| `"non-main"` (default) | Non-main sessions spawn Docker containers | Yes |
| `"all"` | Every session spawns a Docker container | Yes |

**When the gateway itself runs in Docker**, `"non-main"` or `"all"` causes isolated sessions to try spawning Docker containers from inside a container. This fails with `spawn docker EACCES` because the container has no access to the host's Docker daemon.

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

## Named Volumes

Use Docker named volumes with `external: true` for persistent config and workspace data:

```yaml
volumes:
  openclaw-config:
    external: true
  openclaw-workspace:
    external: true
```

| Volume | Container Path | Contents |
|--------|---------------|----------|
| `openclaw-config` | `/home/node/.openclaw` | Config, state, extensions, cron jobs |
| `openclaw-workspace` | `/home/node/workspace` | Agent workspace files (AGENTS.md, TODO.md, etc.) |

### Creating Named Volumes

```bash
docker volume create openclaw-config
docker volume create openclaw-workspace
```

### Seeding Volumes

To populate a named volume from a local directory:

```bash
docker run --rm \
  -v openclaw-config:/dest \
  -v /path/to/local/config:/src \
  alpine sh -c "cp -a /src/. /dest/ && chown -R 1000:1000 /dest"
```

The `chown 1000:1000` ensures files are owned by the `node` user inside the container.

## Editing Config in Docker

Since config lives inside a named volume, edit it via:

```bash
# Option 1: docker exec
docker exec -it openclaw-gateway sh -c "cat /home/node/.openclaw/openclaw.json"
docker exec -it openclaw-gateway sh -c "vi /home/node/.openclaw/openclaw.json"

# Option 2: docker cp
docker cp openclaw-gateway:/home/node/.openclaw/openclaw.json ./openclaw.json
# ... edit locally ...
docker cp ./openclaw.json openclaw-gateway:/home/node/.openclaw/openclaw.json
```

Config hot-reload picks up changes automatically — no restart needed for most settings.

## Related Config

- `gateway.mode: "local"` — tells OpenClaw the gateway runs directly (even inside Docker)
- `controlUi.allowInsecureAuth: true` — needed when Docker bridge networking makes the UI appear non-local, which breaks device auto-pairing

## Container User

The container runs as `node` (UID 1000). Do not run as root — the non-root user is part of the security model.

## Known Issues

- GitHub #5339: Telegram cron announce delivery can silently fail
- GitHub #13420: Cron announce delivery may ignore configured channel
- Consecutive cron errors trigger exponential backoff (30s, 1m, 5m, 15m, 60m) — force-run with `openclaw cron run <jobId>` to reset
