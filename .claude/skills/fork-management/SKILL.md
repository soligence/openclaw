---
name: fork-management
description: How to sync this fork with upstream OpenClaw releases
---

# Fork Management

This repo (`soligence/openclaw`) is a fork of `openclaw/openclaw`.

## Repository Structure

```
GitHub:
  openclaw/openclaw       <- upstream (official)
  soligence/openclaw      <- origin (your fork)

Local:
  C:\projects\openclaw    <- your working copy
```

## Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| origin | github.com/soligence/openclaw | Your fork - push here |
| upstream | github.com/openclaw/openclaw | Official - pull updates |

## Branches

| Branch | Tracks | Purpose |
|--------|--------|---------|
| main | origin/main | Your working branch with customizations |
| upstream-main | upstream/main | Clean mirror of official code |

## Sync Workflow

When official OpenClaw releases updates:

```bash
# 1. Fetch latest from official
git fetch upstream

# 2. Update your clean mirror
git checkout upstream-main
git merge upstream/main --ff-only
git push origin upstream-main

# 3. Merge into your working branch
git checkout main
git merge upstream-main

# 4. Resolve any conflicts, then push
git push origin main
```

## Your Customizations

Keep custom files in these locations:
- `.claude/skills/` - Claude skills
- `skills/` - Custom OpenClaw skills

These stay separate from upstream code, making merges clean.

## Quick Reference

```bash
# Check remotes
git remote -v

# Check branches
git branch -a

# See how far behind upstream you are
git fetch upstream
git log main..upstream/main --oneline
```
