---
name: fork-management
description: Safe, repeatable upstream sync process for this fork
---

# Fork Management

This repo (`soligence/openclaw`) tracks upstream (`openclaw/openclaw`) and carries local ops customizations.

## Layering Strategy

Upstream files stay untouched. Fork customizations live in separate, fork-only files:

| Layer | Files | Merge behavior |
|---|---|---|
| Upstream (accept wholesale) | `docker-compose.yml`, `Dockerfile`, `src/**`, all app code | Always take theirs |
| Fork overlay | `docker-compose.override.yml`, `.claude/skills/**`, `scripts/sync-upstream-safe.mjs`, `scripts/post-sync-health-check.mjs` | Upstream doesn't have these — no conflicts |
| Minor fork additions | `package.json` (sync scripts), `.gitignore` | Low conflict risk, trivial to resolve |

`docker-compose.override.yml` is the key mechanism — Docker Compose auto-merges it on top of the upstream `docker-compose.yml`, so upstream can change their compose file freely without conflicting with our named volumes, user overrides, or env var cleanup.

## Hard Rules

1. Never modify upstream files to add fork-specific behavior. Use the override/overlay pattern instead.
2. Never sync directly on `main` — the sync script uses disposable branches.
3. Runtime validation (cron, heartbeat, Telegram) is required after every sync.

## One-Time Setup

Remotes:

```bash
git remote -v
# origin  -> soligence/openclaw
# upstream -> openclaw/openclaw
```

Named Docker volumes:

```bash
docker volume create openclaw-config
docker volume create openclaw-workspace
```

## Standard Sync

From Windows host (skip install/build/check since those run inside Docker):

```bash
pnpm sync:upstream:safe --allow-dirty --skip-install --skip-build --skip-check
```

What this does:
1. Fetches all remotes.
2. Creates a disposable `sync/upstream-<timestamp>` branch from `origin/main`.
3. Merges `upstream/main` (with `--no-ff --no-edit`).

**Important**: The sync branch is created from `origin/main`, not local `main`. If you have unpushed local commits, promotion requires a regular merge (not ff-only). Commit and push local changes before syncing to keep the history linear.

If the merge has conflicts, resolve them on the sync branch per the conflict policy below.

### Promote & Push

After verifying the sync branch:

```bash
# If main is even with origin/main (ideal):
pnpm sync:upstream:safe --promote --push

# If main has unpushed commits (creates a merge commit):
git switch main
git merge sync/upstream-<timestamp>
# resolve any conflicts, then:
git push origin main
```

## Useful Flags

| Flag | Effect |
|---|---|
| `--allow-dirty` | Bypass clean tree check |
| `--skip-install --skip-build --skip-check` | Skip stages (use on Windows host) |
| `--with-tests` | Run low-memory test profile |
| `--runtime-checks` | Run cron/heartbeat checks via CLI |
| `--promote` | FF-merge sync branch into main |
| `--push` | Push origin/main (requires `--promote`) |
| `--skip-health-check` | Skip automated health check before `--promote` |
| `--branch <name>` | Set explicit sync branch name |

## Conflict Policy

1. **`src/**`, `Dockerfile`, all app code** — accept upstream.
2. **`.claude/skills/**`, `scripts/`** — keep ours (fork-only files).
3. **`docker-compose.yml`** — accept upstream. Move any local changes into `docker-compose.override.yml`.
4. **`package.json`, `.gitignore`** — merge manually (our additions are usually one line).

## Post-Sync: Rebuild & Deploy

```bash
docker build -t openclaw:local .
docker compose up -d openclaw-gateway
```

## Post-Sync: Validation

`--promote` now automatically runs a health check gate before fast-forwarding. If any check fails, promotion is blocked. To bypass: `--skip-health-check`.

Run the health check standalone at any time:

```bash
pnpm sync:health
```

This verifies: Docker engine reachable, gateway container running, no fatal errors in recent logs, cron jobs loaded, and Telegram provider started (warn-only).

For deeper cron inspection, use the manual command:

```bash
MSYS_NO_PATHCONV=1 docker exec openclaw-openclaw-gateway-1 \
  node dist/index.js cron runs --id <jobId> --limit 5
```

**Note**: Use `MSYS_NO_PATHCONV=1` prefix on Windows Git Bash to prevent path mangling in `docker exec` commands.

## Post-Sync: Config Changes

Upstream security hardening may introduce new runtime requirements. Watch for gateway startup failures in the logs. Known examples:

- **`controlUi.allowedOrigins`** (added v2026.2.24): Required when `--bind lan`. Set in config volume.
- **World-writable plugin paths blocked** (added v2026.2.24): Extension dirs must be 755, not 777.

To edit config inside the volume:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v openclaw-config:/data alpine sh -c \
  "apk add --no-cache jq > /dev/null 2>&1 && cd /data && jq '<filter>' openclaw.json | tee openclaw.json.tmp > /dev/null && mv openclaw.json.tmp openclaw.json && chown 1000:1000 openclaw.json"
```

## Recovery

If sync regresses behavior:

1. Stay on the disposable sync branch — don't promote yet.
2. Fix forward on that branch and re-validate.
3. Only then promote to `main`.
