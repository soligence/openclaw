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

Auto-stamped on every config write with `lastTouchedVersion` and `lastTouchedAt`. Do not edit manually.

### `env`

Injects environment variables available to OpenClaw and referenceable via `${VAR}` syntax in other config values. Supports inline key-value pairs (applied when not already set in process env), a structured `vars` object (same effect), and a `shellEnv` sub-object that can exec the login shell to import missing secrets (with configurable timeout).

**Shell env expected keys (auto-imported if missing):**
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `GEMINI_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `MINIMAX_API_KEY`, `ELEVENLABS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD`

### `auth`

Auth profile definitions for AI providers. Contains `profiles` (named credentials with provider, mode, and optional email), `order` (per-provider profile selection priority), and `cooldowns` (billing backoff and failure window settings).

### `models`

Define AI provider endpoints and model catalogs. Key fields: `mode` (`"merge"` default or `"replace"` built-in catalog), and `providers` (a map of provider configs each with `baseUrl`, `apiKey`, `api` adapter type, and `models` array with id/name/contextWindow/maxTokens/input types/cost).

Supported `api` values: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `github-copilot`, `bedrock-converse-stream`, `ollama`

### `agents`

Global agent defaults and named agent list. The `defaults` object sets model (primary + fallbacks), workspace, maxConcurrent (default 3), timeoutSeconds, contextTokens, contextPruning, compaction, heartbeat, and sandbox config. The `list` array contains named agent entries that can override any default, each with an `id`, optional `default: true` flag, `identity` (name/avatar), and any field from defaults.

**Auto-applied defaults (not written to file):**
- `agents.defaults.maxConcurrent` = 3
- `agents.defaults.subagents.maxConcurrent` = 10
- `agents.defaults.compaction.mode` = `"safeguard"`
- `agents.defaults.contextPruning.mode` = `"cache-ttl"` (when Anthropic auth detected)
- `agents.defaults.heartbeat.every` = `"30m"` (api_key) or `"1h"` (oauth)

### `gateway`

HTTP server and remote connection settings. Key fields: `port` (default 18789), `mode` (`"local"` or `"remote"`), `bind` (`"auto"`, `"lan"`, `"loopback"`, `"custom"`, `"tailnet"`), `auth` (mode + token/password/trusted-proxy), `controlUi` (enabled, basePath, allowedOrigins), `reload` (mode: off/restart/hot/hybrid, debounceMs), `tls` (enabled, autoGenerate), `remote` (url, transport: ssh/direct, token).

### `channels`

Per-channel configuration validated against the channel registry. Each channel key (slack, discord, telegram, etc.) contains channel-specific settings (tokens, bot config). A `defaults` sub-object applies settings across all channels. Unknown channel IDs produce validation errors unless provided by a registered plugin.

### `plugins`

Plugin management. Key fields: `enabled` (global toggle), `allow`/`deny` lists, `load.paths` (extra plugin dirs to scan), `slots.memory` (which plugin fills the memory slot), `entries` (per-plugin enabled flag + config), `installs` (source: npm/archive/path, spec).

### `skills`

Skill (slash command) loading and configuration. Key fields: `allowBundled` (list of allowed bundled skills), `load` (extraDirs, watch, watchDebounceMs), `install` (preferBrew, nodeManager: npm/pnpm/yarn/bun), `entries` (per-skill enabled flag, apiKey, env, config).

### `memory`

Memory backend configuration. Key fields: `backend` (`"builtin"` or `"qmd"`), `citations` (`"auto"`, `"on"`, `"off"`), `qmd` sub-object with command, searchMode (query/search/vsearch), paths, update interval, and result limits.

### `cron`

Scheduled job runner. Key fields: `enabled`, `store` (storage path), `maxConcurrentRuns`, `webhook` URL + `webhookToken`, `sessionRetention` (duration or false).

### `logging`

Log configuration. Key fields: `level` (silent through trace), `file` (log file path), `consoleLevel`, `consoleStyle` (pretty/compact/json), `redactSensitive` (default `"tools"`; `"off"` to disable), `redactPatterns` (regex patterns for additional redaction).

---

## Environment Variable Substitution

Config string values support `${VAR_NAME}` syntax for env var injection.

**Rules:**
- Only uppercase names matching `[A-Z_][A-Z0-9_]*` are substituted
- Missing vars throw `MissingEnvVarError` (fails config load)
- Escape with `$${VAR}` to output a literal `${VAR}` string
- Env vars are resolved **after** `$include` processing and before Zod validation

On **write**, the system restores `${VAR}` references in unchanged fields to avoid persisting resolved secrets.

**Source:** `src/config/env-substitution.ts`

---

## Config Includes (`$include`)

Split large configs into modular files using a `$include` key pointing to a single file path or an array of file paths.

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

Programmatic in-process config overrides that bypass file I/O. Use `setConfigOverride(dotpath, value)` to set an override that survives config reload, and `unsetConfigOverride(dotpath)` to remove it. Overrides are applied as the last step in `loadConfig()` and stored in a module-level OverrideTree (in-memory only, cleared on process restart).

**Source:** `src/config/runtime-overrides.ts`

---

## Per-Agent vs Global Config

### Global Defaults (`agents.defaults`)

Applied to all agents unless overridden at the agent level. Covers model, maxConcurrent, workspace, sandbox, and all other agent settings.

### Per-Agent Config (`agents.list[]`)

Each agent entry can override any default field. Agent entries have an `id`, optional `default: true` flag, `model`, `workspace`, `identity` (name, emoji, avatar), `heartbeat`, `sandbox`, and all other agent-level settings.

### Per-Channel Config

Channels can be configured globally (under `channels.defaults`) or per-channel-instance (under `channels.<channelId>`).

---

## Config Profiles

OpenClaw does not have a built-in "profile" concept for the config file itself, but profiles exist in two contexts:

### Auth Profiles (`auth.profiles`)

Multiple auth credentials per provider, with ordered selection via `auth.order.<provider>`.

### Browser Profiles (`browser.profiles`)

Named Chrome/CDP browser instances, each with a `cdpPort`, `driver`, and `color`. Selected via `browser.defaultProfile`.

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
