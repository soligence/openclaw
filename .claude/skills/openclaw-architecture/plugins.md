# Plugin Architecture

## Overview

OpenClaw uses a modular plugin system. There is **1 exclusive plugin kind** (`"memory"` — only one can be active) and **10 registration methods** that any plugin can use. A single plugin can call multiple registration methods simultaneously to provide channels, tools, hooks, and more in one package.

## Registration Methods

| Registration Method | Purpose | Example |
|---------------------|---------|---------|
| **`registerChannel`** | Messaging platform integrations | Telegram, WhatsApp, Discord |
| **`registerProvider`** | LLM/auth providers | OpenRouter, Anthropic, OpenAI |
| **`registerTool`** | Agent tools | MCP adapter, file tools |
| **`registerService`** | Background services | Monitoring, sync |
| **`registerCli`** | Extend CLI commands | Custom commands |
| **`registerHook`** | Lifecycle event handlers | Logging, analytics |
| **`registerCommand`** | Slash commands (bypass LLM) | /tts, /status |
| **`registerHttpHandler`** | HTTP route handlers | Custom API endpoints |
| **`registerHttpRoute`** | HTTP route handlers (alt) | Custom API endpoints |
| **`registerGatewayMethod`** | WebSocket RPC methods | Custom gateway ops |

### Exclusive Plugin Kind

Only `"memory"` is an exclusive kind — set via `kind: "memory"` in the manifest. All other plugins have `kind: null` and use registration methods freely.

## Plugin Locations

```
~/.openclaw/extensions/     # User plugins (highest priority)
[workspace]/.openclaw/      # Workspace plugins
extensions/                 # Bundled plugins (lowest priority)
```

## Plugin Definition

A plugin definition exports an object with: `id`, `name`, `description`, `version`, an optional `configSchema` (Zod-compatible with `safeParse` and optional `uiHints` for marking fields like API keys as sensitive), a `register(api)` callback called when the plugin loads, and an optional `activate(api)` callback called when the plugin activates.

### Manifest (openclaw.plugin.json)

The manifest file declares the plugin's `id`, `name`, `version`, `description`, `main` entry point (path to the compiled JS), and `kind` (null for normal plugins, `"memory"` for the exclusive memory slot).

## Plugin API

The `OpenClawPluginApi` object passed to `register()` and `activate()` provides:

- **Identity:** `id`, `name`
- **Config access:** `config` (full OpenClaw config), `pluginConfig` (plugin-specific config from `plugins.entries.<id>.config`)
- **Runtime:** `runtime` (PluginRuntime), `logger` (PluginLogger)
- **All 10 registration methods** listed above
- **Lifecycle hooks:** `on(hookName, handler, opts)` — subscribe to named lifecycle events
- **Utilities:** `resolvePath(input)` — resolve relative paths against plugin directory

### Tool Registration

Tools are registered via `registerTool()` with a name, description, Zod parameter schema, and async execute function. Tools can also be registered as **context-aware factories** — a function receiving a context object and returning the tool definition, optionally with `{ optional: true }` so the tool only appears when the context matches.

### Hook Registration

Hooks are registered via `registerHook(eventName, handler, opts)`. The handler receives the event object and context. An optional `priority` number controls ordering (higher runs first).

## Lifecycle Hooks

| Hook | When Fired | Use Case |
|------|------------|----------|
| `gateway_start` | Gateway boots | Init services |
| `gateway_stop` | Gateway shuts down | Cleanup |
| `before_agent_start` | Before agent runs | Inject context |
| `agent_end` | After agent completes | Log results |
| `llm_input` | Before LLM call | Monitor/modify |
| `llm_output` | After LLM response | Log usage |
| `before_tool_call` | Before tool executes | Block/modify |
| `after_tool_call` | After tool completes | Log/audit |
| `before_compaction` | Before context compaction | Archive |
| `after_compaction` | After compaction | Analyze |
| `message_received` | Incoming message | Filter/log |
| `message_sending` | Before sending | Modify/block |
| `message_sent` | After sent | Confirm delivery |
| `session_start` | Session begins | Init state |
| `session_end` | Session ends | Cleanup |

## Plugin Discovery

Discovery scans four sources in priority order:

1. Bundled `extensions/` directory (lowest priority)
2. Global `~/.openclaw/extensions/` directory
3. Workspace `.openclaw/extensions/` directory
4. Config `plugins.entries` (highest priority)

The merged list is returned with priority metadata. Source: `discovery.ts`

## Plugin Loading

Loading follows a 6-step pipeline:

1. Read manifest (`openclaw.plugin.json`)
2. Import main module
3. Validate definition
4. Create plugin API instance
5. Call `register()`
6. Return loaded plugin

Source: `loader.ts`

## Config

Plugin management is configured under `plugins` in the main config, with fields for: `enabled` (global toggle), `allow`/`deny` lists, `load.paths` (extra plugin dirs), `slots.memory` (which plugin fills the memory slot), `entries` (per-plugin enable/config), and `installs` (source and spec for npm/archive/path installs).

## Tool Visibility

For plugin tools to be visible to agents, the agent's tool policy must include `group:plugins` in its allow list (or use a profile like `full` that includes all tools). The default tool profiles include plugin tools when `group:openclaw` or `group:plugins` is in the allow list.

## Memory Plugins (Exclusive)

Memory plugins set `kind: "memory"` in their definition. Only one memory plugin can be active at a time — the active one is selected via `plugins.slots.memory` in config. Memory plugins override the default built-in memory handling when registered.

## Provider Plugins

Provider plugins register via `registerProvider()` with: `id`, `label`, `docsPath`, optional `aliases`, a `models` map (model ID to context window and capabilities), and an `auth` array defining authentication flows (API key, OAuth, token) with their setup handlers.

## Command Plugins

Command plugins register slash commands via `registerCommand()` with: `name`, `description`, `acceptsArgs` flag, optional `requireAuth` flag, and a `handler` function that receives context and returns a response object.

## Service Plugins

Service plugins register background services via `registerService()` with: `id`, `start(ctx)` (called when the gateway boots), and `stop(ctx)` (called on shutdown for cleanup).

## CLI Extension

Plugins extend the CLI via `registerCli(registrar, opts)`. The registrar function receives the Commander program context and can add commands. The `opts.commands` array declares which command names the plugin provides (used for lazy loading optimization).

## Key Files

| File | Purpose |
|------|---------|
| `types.ts` | Plugin type definitions |
| `discovery.ts` | Plugin scanning |
| `loader.ts` | Plugin loading |
| `registry.ts` | Plugin registry |
| `manifest.ts` | Manifest parsing |
| `runtime.ts` | Runtime context |
| `tools.ts` | Tool registration |
| `hooks.ts` | Hook management |
| `services.ts` | Service lifecycle |
| `providers.ts` | Provider registry |
| `commands.ts` | Command registry |
| `cli.ts` | CLI extension |

## Diagnostics

Plugin diagnostics are collected during load as structured records with `level` (warn/error), `message`, optional `pluginId`, and optional `source`. They are reported via:
- Gateway logs
- `openclaw plugins status`
- Health endpoint

## Best Practices

1. **Use `optional: true`** for context-dependent tools
2. **Set hook priority** for ordering multiple handlers
3. **Validate config** with Zod schemas
4. **Handle cleanup** in `stop()` for services
5. **Mark sensitive config** with `uiHints.sensitive: true`
