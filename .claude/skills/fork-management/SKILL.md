---
name: fork-management
description: Safe, repeatable upstream sync process for this fork
---

# Fork Management

This repo (`soligence/openclaw`) tracks upstream (`openclaw/openclaw`) and also carries local ops customizations.

## Goals

1. Keep core code current with upstream.
2. Keep local runtime state and ops knobs stable.
3. Make sync failures happen on a disposable branch, never on `main`.

## Hard Rules

1. Do not sync directly on `main`.
2. Keep local machine/container overrides out of tracked upstream files.
3. Treat runtime checks (`cron`, `heartbeat`) as required after sync.

## One-Time Setup

1. Remotes:

```bash
git remote -v
```

Expect both:

- `origin` -> `soligence/openclaw`
- `upstream` -> `openclaw/openclaw`

2. Local compose overrides:

- Copy `docker-compose.override.example.yml` to `docker-compose.override.yml`.
- Set `OPENCLAW_CONFIG_DIR` and `OPENCLAW_WORKSPACE_DIR` in `.env`.
- Keep `docker-compose.override.yml` untracked (already gitignored).

This keeps local bind mounts and permissions out of upstream merge churn.

## Standard Sync Command

Preferred:

```bash
pnpm sync:upstream:safe --with-tests --runtime-checks
```

What this does:

1. Verifies remotes and (by default) a clean working tree.
2. Fetches all remotes.
3. Creates a disposable branch from `origin/main`.
4. Merges `upstream/main`.
5. Runs:
   - `pnpm install`
   - `pnpm build`
   - `pnpm check`
   - optional low-memory test profile (`--with-tests`)
   - optional runtime checks (`--runtime-checks`):
     - `pnpm openclaw cron status`
     - `pnpm openclaw cron list`
     - `pnpm openclaw system heartbeat last`

If all checks pass, promote:

```bash
pnpm sync:upstream:safe --promote --push
```

## Useful Flags

- `--branch <name>`: set explicit sync branch name.
- `--allow-dirty`: bypass clean tree check.
- `--skip-install --skip-build --skip-check`: skip selected stages.
- `--promote`: ff-merge sync branch into `main`.
- `--push`: push `origin/main` (requires `--promote`).

## Conflict Policy

When conflicts happen:

1. Keep upstream for `src/**` unless you intentionally diverged.
2. Keep fork-local process docs and skills under `.claude/**`.
3. For Docker/runtime wiring, preserve local behavior by moving it into `docker-compose.override.yml` rather than editing `docker-compose.yml`.

## Post-Sync Validation

Run after promotion:

```bash
pnpm openclaw cron status
pnpm openclaw cron list
pnpm openclaw system heartbeat last
```

If cron jobs are present:

```bash
pnpm openclaw cron runs --id <jobId> --limit 20
```

## Recovery

If sync regresses behavior:

1. Stop promotion. Stay on the disposable sync branch.
2. Fix forward on that branch and rerun checks.
3. Only then promote to `main`.
