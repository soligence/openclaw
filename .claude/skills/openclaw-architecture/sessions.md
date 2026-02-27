# Sessions

## Overview

Sessions are how OpenClaw manages conversation state. There are two fundamentally different session types that behave differently regarding context and persistence.

## Session Types

### Main Session (persistent, resets daily)

- **Key:** `agent:main:main`
- **What goes here:** All Telegram DMs + heartbeat polls share this one conversation
- **Context:** Accumulates throughout the day — each new message sees all prior messages
- **Reset:** Daily at a configurable hour (default: 4:00 AM gateway local time)
- **Manual reset:** Send `/new` in Telegram to force a fresh session
- **File:** `~/.openclaw/agents/main/sessions/<sessionId>.jsonl`

### Isolated Cron Session (fresh every run)

- **Key:** `cron:<jobId>:run:<random-uuid>`
- **What goes here:** Each cron job run gets its own brand new session
- **Context:** Zero conversation history — only sees system prompt + workspace files + cron message
- **Cannot see:** Telegram chats, prior briefings, or any main session context
- **Implication:** Quality depends entirely on what the agent finds in workspace files each run

## Session Key Format

```
agent:<agentId>:<channel>:<chatType>:<peerId>[:thread:<threadId>]
```

Examples:
- `agent:main:main` — main DM session
- `agent:main:telegram:direct:12345678` — Telegram DM
- `agent:main:telegram:group:-100123456` — Telegram group
- `cron:<jobId>:run:<uuid>` — isolated cron run

## Session Lifecycle

```
Session reset hour    → Main session resets (new session ID)
Cron schedule fires   → Fresh isolated session created
Heartbeat fires       → Runs in main session (accumulates context)
Channel messages      → Accumulate in main session throughout the day
Next reset hour       → Session resets again
```

The reset hour is configurable. Default is 4:00 AM gateway local time. Inside Docker the gateway typically runs in UTC, so adjust accordingly for your timezone.

## Heartbeat

Periodic pulse injected into the **main session** (same conversation as channel DMs).

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

**Use for:** Checking email, calendar, notifications — anything that benefits from main session context.

## Cron Jobs

Scheduled tasks that run in a **separate fresh session** (or optionally main session).

- Fires at exact times (cron expression)
- Output delivered via announce (Telegram), webhook, or none
- Jobs stored at `~/.openclaw/cron/jobs.json`
- Session key is `cron:<jobId>`, which counts as non-main for sandbox purposes

**Use for:** Daily briefings, weekly summaries, exact-schedule tasks.

## Workspace Files = The Agent's Memory Between Sessions

Since isolated cron sessions have no conversation context, the agent relies entirely on workspace files for continuity:

- `AGENTS.md` — instructions for how to behave
- `SOUL.md` — personality/identity
- `USER.md` — info about the user
- `MEMORY.md` — long-term curated memory
- `TODO.md` — task list (critical for daily briefing quality)
- `memory/YYYY-MM-DD.md` — daily notes

**If TODO.md is empty, the daily briefing will be generic.** The agent can't remember what it read yesterday because each cron run is a blank slate. Keep workspace files populated.

## Cost Optimization

| Heartbeat interval | Calls/day | Approx cost/day | When to use |
|-------------------|-----------|-----------------|-------------|
| `"30m"` | 48 | ~$1.00-1.20 | Email + calendar connected, need real-time checks |
| `"2h"` | 12 | ~$0.25-0.30 | Some integrations, periodic checks sufficient |
| `"24h"` | 1 | ~$0.02-0.03 | No integrations yet |
| `"0m"` | 0 | $0 | Disabled — rely on cron + direct messages only |
