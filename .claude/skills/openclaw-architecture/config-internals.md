# Config & Settings Architecture

## Overview

OpenClaw uses a single JSON5 config file (`~/.openclaw/openclaw.json`) validated against a comprehensive Zod schema. The config system supports environment variable substitution, file includes, runtime overrides, legacy migration, and hot reload — all managed through a layered processing pipeline.

---

## Config File Location

### Primary Location

```
~/.openclaw/openclaw.json
```

### Path Resolution Precedence

1. `OPENCLAW_CONFIG_PATH` env var (explicit override)
2. `CLAWDBOT_CONFIG_PATH` env var (legacy alias)
3. `$OPENCLAW_STATE_DIR/openclaw.json` (if state dir is overridden)
4. `~/.openclaw/openclaw.json` (new default)
5. Legacy fallback dirs: `~/.clawdbot/`, `~/.moldbot/`, `~/.moltbot/`

**Source:** `src/config/paths.ts:resolveConfigPath()`

### State Directory

The state directory (sessions, logs, caches) defaults to `~/.openclaw` and can be overridden via:
- `OPENCLAW_STATE_DIR`
- `CLAWDBOT_STATE_DIR` (legacy alias)

The config file is always `openclaw.json` within the state directory.

---

## Config Load Pipeline

When config is loaded (`loadConfig()`), the following steps occur in sequence:

```
1. Read raw file (JSON5 format)
2. Resolve $include directives (modular file composition)
3. Apply config.env vars to process.env
4. Substitute ${ENV_VAR} references in string values
5. Run Zod schema validation (OpenClawSchema)
6. Check for legacy (deprecated) config keys
7. Apply runtime defaults (model, agent, session, logging, compaction, pruning)
8. Normalize paths (expand ~ and resolve relative paths)
9. Check for duplicate agent workspace dirs
10. Apply shell env fallback (if enabled)
11. Apply runtime overrides (in-memory, programmatic overrides)
```

**Source:** `src/config/io.ts:createConfigIO().loadConfig()`

### Short-lived Config Cache

A 200ms in-memory cache prevents redundant reads during rapid successive calls. Controlled by:
- `OPENCLAW_CONFIG_CACHE_MS` — override cache TTL (0 = disabled)
- `OPENCLAW_DISABLE_CONFIG_CACHE` — fully disable cache

---

## Full Config Schema Reference

The root schema is `OpenClawSchema` (Zod) exported from `src/config/zod-schema.ts`.

### Top-Level Keys

| Key | Type | Description |
|-----|------|-------------|
| `$schema` | `string` | Optional JSON Schema URI for editor tooling |
| `meta` | `object` | Auto-stamped version metadata |
| `env` | `object` | Environment variable injection and shell env fallback |
| `wizard` | `object` | Setup wizard run history (auto-managed) |
| `diagnostics` | `object` | OpenTelemetry, cache tracing, debug flags |
| `logging` | `object` | Log levels, file output, sensitive redaction |
| `update` | `object` | Update channel (stable/beta/dev) and auto-check |
| `browser` | `object` | Chrome/CDP browser integration config |
| `ui` | `object` | Control UI accent color and assistant identity |
| `auth` | `object` | Auth profiles, provider order, rate limit cooldowns |
| `models` | `object` | Provider definitions and model catalogs |
| `nodeHost` | `object` | Node host browser proxy settings |
| `agents` | `object` | Agent defaults and named agent list |
| `tools` | `object` | Tool enable/deny, sandbox, media, links |
| `bindings` | `array` | Channel-to-agent routing rules |
| `broadcast` | `object` | Multi-agent broadcast strategy |
| `audio` | `object` | Audio transcription config |
| `media` | `object` | Media handling settings |
| `messages` | `object` | Message queue, TTS, group chat, reply policy |
| `commands` | `object` | Slash command configuration |
| `approvals` | `object` | Tool approval policy |
| `session` | `object` | Session key and send policy |
| `web` | `object` | WebSocket reconnect and heartbeat |
| `channels` | `object` | Per-channel config (Slack, Discord, Telegram, etc.) |
| `cron` | `object` | Scheduled job runner |
| `hooks` | `object` | Webhook ingress (HTTP hooks) |
| `discovery` | `object` | mDNS and wide-area discovery |
| `canvasHost` | `object` | Canvas file server |
| `talk` | `object` | TTS voice and API key |
| `gateway` | `object` | Gateway server, auth, TLS, reload, remote config |
| `memory` | `object` | Memory backend (builtin or qmd) |
| `skills` | `object` | Skill loading, installation, per-skill config |
| `plugins` | `object` | Plugin enable/deny, slot assignment, per-plugin config |

---

## Key Section Details

### `meta`

Auto-stamped on every config write. Do not edit manually.

```json5
{
  meta: {
    lastTouchedVersion: "1.2.3",
    lastTouchedAt: "2026-02-18T00:00:00.000Z"
  }
}
```

### `env`

Inject environment variables that will be available to OpenClaw and can be referenced via `${VAR}` syntax in other config values.

```json5
{
  env: {
    // Inline key-value pairs (applied when not already set in process env)
    ANTHROPIC_API_KEY: "sk-ant-...",

    // Structured form (same effect)
    vars: {
      OPENAI_API_KEY: "sk-..."
    },

    // Shell env fallback: exec login shell and import missing secrets
    shellEnv: {
      enabled: true,
      timeoutMs: 15000
    }
  }
}
```

**Shell env expected keys (auto-imported if missing):**
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `GEMINI_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `MINIMAX_API_KEY`, `ELEVENLABS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD`

### `auth`

Auth profile definitions for AI providers:

```json5
{
  auth: {
    profiles: {
      "my-anthropic": {
        provider: "anthropic",
        mode: "api_key",  // or "oauth" | "token"
        email: "user@example.com"  // optional, for oauth
      }
    },
    order: {
      anthropic: ["my-anthropic"]  // profile selection order
    },
    cooldowns: {
      billingBackoffHours: 1,
      billingMaxHours: 24,
      failureWindowHours: 6
    }
  }
}
```

### `models`

Define AI provider endpoints and model catalogs:

```json5
{
  models: {
    mode: "merge",  // "merge" (default) or "replace" built-in catalog
    providers: {
      "my-provider": {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "${MY_PROVIDER_API_KEY}",
        api: "openai-completions",  // API adapter type
        models: [
          {
            id: "gpt-5",
            name: "GPT-5",
            contextWindow: 200000,
            maxTokens: 8192,
            input: ["text", "image"],
            cost: { input: 5, output: 15 }  // per million tokens
          }
        ]
      }
    }
  }
}
```

Supported `api` values: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `github-copilot`, `bedrock-converse-stream`, `ollama`

### `agents`

Global agent defaults and named agent list:

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["openai/gpt-5"]
      },
      workspace: "/path/to/workspace",
      maxConcurrent: 3,       // default: 3
      timeoutSeconds: 300,
      contextTokens: 100000,
      contextPruning: {
        mode: "cache-ttl",    // default (auto-applied)
        ttl: "1h",
        keepLastAssistants: 2
      },
      compaction: {
        mode: "safeguard",    // default (auto-applied)
        maxHistoryShare: 0.7
      },
      heartbeat: {
        every: "30m",         // auto-set based on auth mode
        target: "last"
      },
      sandbox: { /* docker/podman config */ }
    },
    list: [
      {
        id: "my-agent",
        default: true,
        identity: {
          name: "MyBot",
          avatar: "avatar.png"
        },
        model: { primary: "anthropic/claude-sonnet-4-5" },
        workspace: "/custom/workspace"
      }
    ]
  }
}
```

**Auto-applied defaults (not written to file):**
- `agents.defaults.maxConcurrent` = 3
- `agents.defaults.subagents.maxConcurrent` = 10
- `agents.defaults.compaction.mode` = `"safeguard"`
- `agents.defaults.contextPruning.mode` = `"cache-ttl"` (when Anthropic auth detected)
- `agents.defaults.heartbeat.every` = `"30m"` (api_key) or `"1h"` (oauth)

### `gateway`

HTTP server and remote connection settings:

```json5
{
  gateway: {
    port: 18789,              // default port
    mode: "local",            // "local" | "remote"
    bind: "loopback",         // "auto" | "lan" | "loopback" | "custom" | "tailnet"
    auth: {
      mode: "token",          // "token" | "password" | "trusted-proxy"
      token: "${OPENCLAW_GATEWAY_TOKEN}"
    },
    controlUi: {
      enabled: true,
      basePath: "/",
      allowedOrigins: ["*"]
    },
    reload: {
      mode: "hybrid",         // "off" | "restart" | "hot" | "hybrid"
      debounceMs: 500
    },
    tls: {
      enabled: false,
      autoGenerate: true
    },
    remote: {
      url: "https://my-server.com",
      transport: "ssh",       // "ssh" | "direct"
      token: "${REMOTE_TOKEN}"
    }
  }
}
```

### `channels`

Per-channel configuration (validated against channel registry):

```json5
{
  channels: {
    slack: {
      botToken: "${SLACK_BOT_TOKEN}",
      appToken: "${SLACK_APP_TOKEN}",
      // channel-specific settings...
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
      // discord-specific settings...
    },
    telegram: {
      token: "${TELEGRAM_BOT_TOKEN}"
    }
    // defaults: { /* applied to all channels */ }
  }
}
```

Unknown channel IDs produce validation errors unless provided by a registered plugin.

### `plugins`

Plugin management:

```json5
{
  plugins: {
    enabled: true,
    allow: ["my-plugin"],     // allowlist (empty = all allowed)
    deny: ["bad-plugin"],     // denylist
    load: {
      paths: ["./my-plugins"] // extra plugin dirs to scan
    },
    slots: {
      memory: "mem-plugin-id" // which plugin fills the memory slot
    },
    entries: {
      "my-plugin": {
        enabled: true,
        config: { /* plugin-specific config */ }
      }
    },
    installs: {
      "my-plugin": {
        source: "npm",        // "npm" | "archive" | "path"
        spec: "my-plugin@1.0.0"
      }
    }
  }
}
```

### `skills`

Skill (slash command) loading and configuration:

```json5
{
  skills: {
    allowBundled: ["commit", "review-pr"],  // allow specific bundled skills
    load: {
      extraDirs: ["./skills"],
      watch: true,
      watchDebounceMs: 300
    },
    install: {
      preferBrew: false,
      nodeManager: "npm"  // "npm" | "pnpm" | "yarn" | "bun"
    },
    entries: {
      "my-skill": {
        enabled: true,
        apiKey: "${SKILL_API_KEY}",
        env: { EXTRA_VAR: "value" },
        config: { /* skill-specific */ }
      }
    }
  }
}
```

### `memory`

Memory backend configuration:

```json5
{
  memory: {
    backend: "builtin",     // "builtin" | "qmd"
    citations: "auto",      // "auto" | "on" | "off"
    qmd: {
      command: "qmd",
      searchMode: "query",  // "query" | "search" | "vsearch"
      paths: [{ path: "./knowledge", name: "docs" }],
      update: {
        interval: "5m",
        onBoot: true
      },
      limits: {
        maxResults: 10,
        maxSnippetChars: 500
      }
    }
  }
}
```

### `cron`

Scheduled job runner:

```json5
{
  cron: {
    enabled: true,
    store: "./cron-store",
    maxConcurrentRuns: 3,
    webhook: "https://my-server.com/webhook",
    webhookToken: "${CRON_WEBHOOK_TOKEN}",
    sessionRetention: "7d"  // or false to disable
  }
}
```

### `logging`

```json5
{
  logging: {
    level: "info",          // "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace"
    file: "./logs/openclaw.log",
    consoleLevel: "warn",
    consoleStyle: "pretty", // "pretty" | "compact" | "json"
    redactSensitive: "tools",  // default (auto-applied); "off" | "tools"
    redactPatterns: ["sk-ant-.*"]
  }
}
```

---

## Environment Variable Substitution

Config string values support `${VAR_NAME}` syntax for env var injection:

```json5
{
  models: {
    providers: {
      "my-provider": {
        apiKey: "${MY_API_KEY}"
      }
    }
  }
}
```

**Rules:**
- Only uppercase names matching `[A-Z_][A-Z0-9_]*` are substituted
- Missing vars throw `MissingEnvVarError` (fails config load)
- Escape with `$${VAR}` to output a literal `${VAR}` string
- Env vars are resolved **after** `$include` processing and before Zod validation

On **write**, the system restores `${VAR}` references in unchanged fields to avoid persisting resolved secrets.

**Source:** `src/config/env-substitution.ts`

---

## Config Includes (`$include`)

Split large configs into modular files:

```json5
// openclaw.json
{
  "$include": "./base.json5",   // single file include
  gateway: {
    port: 18789
  }
}

// Or merge multiple files
{
  "$include": ["./base.json5", "./channels.json5"],
  models: { /* local overrides */ }
}
```

**Semantics:**
- Included files are deep-merged (objects recursively merged, arrays concatenated, primitives: local wins)
- Includes are processed recursively (max depth: 10)
- Circular includes are detected and rejected
- Paths are relative to the including file

**Source:** `src/config/includes.ts`

---

## Config Hierarchy and Precedence

From lowest to highest priority:

```
1. Runtime defaults (hardcoded in defaults.ts, applied in memory — never written to file)
2. Config file values (~/.openclaw/openclaw.json)
3. Included files ($include directives, merged into config file)
4. Environment variables (process.env, applied after $include resolution)
5. config.env vars (applied to process.env before ${VAR} substitution)
6. Runtime overrides (programmatic setConfigOverride() calls, in-memory only)
```

**Important:** Runtime defaults are **not** written back to the config file. The file only contains explicitly set values. Defaults are re-applied fresh on each load.

---

## Validation and Error Handling

### Validation Pipeline

1. **Legacy detection** (`findLegacyConfigIssues`): Checks for deprecated keys (e.g., top-level `whatsapp`, `telegram`, `agent`, `routing.*`). Returns errors blocking load.

2. **Zod validation** (`OpenClawSchema.safeParse`): Full schema validation. All fields are optional; `.strict()` rejects unknown keys.

3. **Duplicate agent dirs check**: Detects agents sharing the same workspace directory.

4. **Identity avatar validation**: Avatar paths must be workspace-relative, http(s) URLs, or data URIs.

5. **Plugin config validation**: Checks plugin entries reference known plugin IDs; validates plugin config schemas.

6. **Channel validation**: Unknown channel IDs are errors (unless from a registered plugin).

7. **Broadcast validation**: `broadcast.*` arrays must reference known `agents.list[].id` values.

### Error Behavior

- **Invalid config** → logs error details, returns `{}` (empty config, no crash)
- **JSON5 parse error** → snapshot marked invalid, details reported
- **Missing `${ENV_VAR}`** → throws `MissingEnvVarError`, snapshot invalid
- **Circular `$include`** → throws `CircularIncludeError`, snapshot invalid
- **Validation warnings** → logged but config still loads

### Config Preservation on Write

Before writing, the system:
1. Reads the current file
2. Creates a merge patch (only changed fields)
3. Applies the patch to the `resolved` (pre-default) config
4. Restores `${ENV_VAR}` references for unchanged sensitive fields
5. Validates the result before writing
6. Writes atomically via temp file + rename (with Windows fallback to copy)
7. Rotates `.bak` backup files
8. Appends an audit record to `~/.openclaw/logs/config-audit.jsonl`

---

## Hot Reload

### Gateway Reload Modes

Configured via `gateway.reload`:

| Mode | Behavior |
|------|----------|
| `"off"` | No reload on config change |
| `"restart"` | Full gateway restart |
| `"hot"` | In-process hot reload (no restart) |
| `"hybrid"` | Hot reload when possible, restart on major changes |

`debounceMs` (default suggested: 500ms) delays reload after file change detection.

### Runtime Overrides

Programmatic in-process config overrides that bypass file I/O:

```typescript
import { setConfigOverride, unsetConfigOverride, applyConfigOverrides } from "./runtime-overrides";

// Set a dotpath override (survives config reload)
setConfigOverride("agents.defaults.timeoutSeconds", 600);

// Remove an override
unsetConfigOverride("agents.defaults.timeoutSeconds");

// Applied as the last step in loadConfig()
const cfg = applyConfigOverrides(loadedConfig);
```

Overrides are stored in a module-level `OverrideTree` (in-memory only, cleared on process restart).

**Source:** `src/config/runtime-overrides.ts`

---

## Per-Agent vs Global Config

### Global Defaults (`agents.defaults`)

Applied to all agents unless overridden at the agent level:

```json5
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-opus-4-6" },
      maxConcurrent: 3,
      workspace: "./workspace",
      sandbox: { docker: { image: "node:22" } }
    }
  }
}
```

### Per-Agent Config (`agents.list[]`)

Each agent entry can override any default:

```json5
{
  agents: {
    list: [
      {
        id: "code-agent",
        default: true,
        model: { primary: "anthropic/claude-opus-4-6" },
        workspace: "./code-workspace",
        identity: {
          name: "CodeBot",
          emoji: "🤖",
          avatar: "bot.png"
        },
        heartbeat: {
          every: "1h",
          target: "slack"
        },
        sandbox: {
          docker: {
            image: "custom-sandbox:latest",
            network: "none"
          }
        }
      },
      {
        id: "chat-agent",
        model: { primary: "anthropic/claude-sonnet-4-5" }
      }
    ]
  }
}
```

### Per-Channel Config

Channels can be configured globally (under `channels.defaults`) or per-channel-instance:

```json5
{
  channels: {
    defaults: {
      // Applied across all channels (channel-specific schema)
    },
    slack: {
      // Slack-specific config
    },
    discord: {
      // Discord-specific config
    }
  }
}
```

---

## Config Profiles

OpenClaw does not have a built-in "profile" concept for the config file itself, but profiles exist in two contexts:

### Auth Profiles (`auth.profiles`)

Multiple auth credentials per provider, with ordered selection:

```json5
{
  auth: {
    profiles: {
      "primary-anthropic": { provider: "anthropic", mode: "api_key" },
      "backup-anthropic": { provider: "anthropic", mode: "oauth" }
    },
    order: {
      anthropic: ["primary-anthropic", "backup-anthropic"]
    }
  }
}
```

### Browser Profiles (`browser.profiles`)

Named Chrome/CDP browser instances:

```json5
{
  browser: {
    defaultProfile: "main",
    profiles: {
      "main": { cdpPort: 9222, driver: "clawd", color: "#4A90D9" },
      "dev": { cdpPort: 9223, color: "#E74C3C" }
    }
  }
}
```

---

## Legacy Config Migration

OpenClaw detects deprecated config structures via `LEGACY_CONFIG_RULES` and applies automatic migrations via `LEGACY_CONFIG_MIGRATIONS` (3 parts, applied during `openclaw doctor --migrate`).

### Deprecated Paths and Their Replacements

| Legacy Path | New Path |
|------------|---------|
| `whatsapp` | `channels.whatsapp` |
| `telegram` | `channels.telegram` |
| `discord` | `channels.discord` |
| `slack` | `channels.slack` |
| `signal` | `channels.signal` |
| `imessage` | `channels.imessage` |
| `msteams` | `channels.msteams` |
| `routing.allowFrom` | `channels.whatsapp.allowFrom` |
| `routing.bindings` | `bindings` (top-level) |
| `routing.agents` | `agents.list` |
| `routing.defaultAgentId` | `agents.list[].default` |
| `routing.agentToAgent` | `tools.agentToAgent` |
| `routing.queue` | `messages.queue` |
| `routing.transcribeAudio` | `tools.media.audio.models` |
| `identity` | `agents.list[].identity` |
| `agent.*` | `agents.defaults.*` |
| `agent.model` (string) | `agents.defaults.model.primary` |
| `agent.allowedModels` | `agents.defaults.models` |
| `agent.modelAliases` | `agents.defaults.models.*.alias` |
| `memorySearch` | `agents.defaults.memorySearch` |
| `tools.bash` | `tools.exec` |
| `gateway.token` | `gateway.auth.token` |
| `messages.tts.enabled` | `messages.tts.auto` |

Legacy detection occurs on every config read. Detected issues block config load until migrated.

**Source:** `src/config/legacy.rules.ts`, `src/config/legacy.migrations.part-{1,2,3}.ts`

---

## Sensitive Field Handling

Fields marked with `.register(sensitive)` in the Zod schema are tracked for:
- UI redaction (not shown in Control UI forms)
- Log redaction (configurable via `logging.redactSensitive`)
- Audit log tracking

Common sensitive fields:
- `models.providers.*.apiKey`
- `gateway.auth.token`, `gateway.auth.password`
- `gateway.remote.token`, `gateway.remote.password`
- `skills.entries.*.apiKey`
- `cron.webhookToken`
- `hooks.token`
- `talk.apiKey`
- `channels.*.token`, `channels.*.botToken` (per-channel)

**Source:** `src/config/zod-schema.sensitive.ts`

---

## Config Write Audit Log

Every config write is recorded to:
```
~/.openclaw/logs/config-audit.jsonl
```

Each record includes: timestamp, config path, file size delta, hash change, changed path count, gateway mode before/after, and suspicious change detection (large size drops, missing meta, gateway mode removal).

---

## Default Model Aliases

These convenience aliases are resolved at runtime:

| Alias | Resolves To |
|-------|-------------|
| `opus` | `anthropic/claude-opus-4-6` |
| `sonnet` | `anthropic/claude-sonnet-4-5` |
| `gpt` | `openai/gpt-5.2` |
| `gpt-mini` | `openai/gpt-5-mini` |
| `gemini` | `google/gemini-3-pro-preview` |
| `gemini-flash` | `google/gemini-3-flash-preview` |

**Source:** `src/config/defaults.ts:DEFAULT_MODEL_ALIASES`

---

## Nix Mode

When `OPENCLAW_NIX_MODE=1`, OpenClaw treats config as externally managed (read-only from OpenClaw's perspective). No auto-install flows run, and missing dependencies produce Nix-specific error messages.

**Source:** `src/config/paths.ts:resolveIsNixMode()`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/config/zod-schema.ts` | Root `OpenClawSchema` Zod definition |
| `src/config/types.openclaw.ts` | `OpenClawConfig` TypeScript type |
| `src/config/io.ts` | Config read/write I/O pipeline |
| `src/config/paths.ts` | File path resolution logic |
| `src/config/validation.ts` | Zod validation + plugin/channel checks |
| `src/config/defaults.ts` | Runtime default application functions |
| `src/config/runtime-overrides.ts` | In-memory config override system |
| `src/config/env-substitution.ts` | `${VAR}` substitution engine |
| `src/config/env-vars.ts` | `config.env` application to process.env |
| `src/config/includes.ts` | `$include` directive processor |
| `src/config/legacy.ts` | Legacy issue detection + migration |
| `src/config/legacy.rules.ts` | Deprecated key definitions |
| `src/config/legacy.migrations.part-{1,2,3}.ts` | Migration transformations |
| `src/config/schema.ts` | JSON Schema generation for Control UI |
| `src/config/schema.hints.ts` | UI hint metadata for config fields |
| `src/config/backup-rotation.ts` | `.bak` file rotation on write |
