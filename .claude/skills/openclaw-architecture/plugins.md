# Plugin Architecture

## Overview

OpenClaw uses a modular plugin system supporting 10 distinct plugin types. Plugins extend functionality without modifying core code.

## Plugin Types

| Type | Purpose | Example |
|------|---------|---------|
| **Channel** | Messaging platform integrations | Telegram, WhatsApp, Discord |
| **Provider** | LLM/auth providers | OpenRouter, Anthropic, OpenAI |
| **Tool** | Agent tools | MCP adapter, file tools |
| **Memory** | Session memory (exclusive slot) | Custom memory backends |
| **Service** | Background services | Cron jobs, monitoring |
| **CLI** | Extend CLI commands | Custom commands |
| **Hook** | Lifecycle event handlers | Logging, analytics |
| **Command** | Slash commands (bypass LLM) | /tts, /status |
| **HTTP** | HTTP route handlers | Custom API endpoints |
| **Gateway Method** | WebSocket RPC methods | Custom gateway ops |

## Plugin Locations

```
~/.openclaw/extensions/     # User plugins (highest priority)
[workspace]/.openclaw/      # Workspace plugins
extensions/                 # Bundled plugins (lowest priority)
```

## Plugin Definition

### Structure

```typescript
// plugin.ts
export const plugin: OpenClawPluginDefinition = {
  id: "my-plugin",
  name: "My Plugin",
  description: "Does something useful",
  version: "1.0.0",

  // Config schema (Zod-compatible)
  configSchema: {
    safeParse: (value) => mySchema.safeParse(value),
    uiHints: {
      apiKey: { sensitive: true, label: "API Key" }
    }
  },

  // Called when plugin loads
  register: (api) => {
    // Register tools, hooks, etc.
  },

  // Called when plugin activates
  activate: (api) => {
    // Start services, etc.
  }
};
```

### Manifest (openclaw.plugin.json)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "main": "./dist/index.js",
  "kind": null
}
```

## Plugin API

### Core Methods

```typescript
type OpenClawPluginApi = {
  id: string;
  name: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;

  // Registration methods
  registerTool: (tool, opts?) => void;
  registerHook: (events, handler, opts?) => void;
  registerChannel: (registration) => void;
  registerProvider: (provider) => void;
  registerService: (service) => void;
  registerCli: (registrar, opts?) => void;
  registerCommand: (command) => void;
  registerHttpHandler: (handler) => void;
  registerHttpRoute: (params) => void;
  registerGatewayMethod: (method, handler) => void;

  // Lifecycle hooks
  on: (hookName, handler, opts?) => void;

  // Utilities
  resolvePath: (input) => string;
};
```

### Tool Registration

```typescript
// Simple tool
api.registerTool({
  name: "my_tool",
  description: "Does something",
  parameters: z.object({ input: z.string() }),
  execute: async ({ input }) => ({ result: input.toUpperCase() })
});

// Tool factory (context-aware)
api.registerTool(
  (ctx) => ({
    name: "workspace_tool",
    description: `Operates in ${ctx.workspaceDir}`,
    execute: async () => { /* ... */ }
  }),
  { optional: true }  // Only available if context matches
);
```

### Hook Registration

```typescript
api.registerHook(
  "llm_output",
  async (event, ctx) => {
    console.log(`Model ${event.model} used ${event.usage?.total} tokens`);
  },
  { priority: 10 }  // Higher = runs first
);
```

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

```typescript
// discovery.ts
function discoverPlugins(params: DiscoverParams): PluginSource[] {
  // 1. Scan bundled extensions/
  // 2. Scan global ~/.openclaw/extensions/
  // 3. Scan workspace .openclaw/extensions/
  // 4. Check config plugins.entries
  // Return merged list with priority
}
```

## Plugin Loading

```typescript
// loader.ts
async function loadPlugin(source: PluginSource): Promise<LoadedPlugin> {
  // 1. Read manifest (openclaw.plugin.json)
  // 2. Import main module
  // 3. Validate definition
  // 4. Create plugin API instance
  // 5. Call register()
  // 6. Return loaded plugin
}
```

## Config Schema

```json
{
  "plugins": {
    "entries": {
      "plugin-id": {
        "enabled": true,
        "config": {
          "key": "value"
        }
      }
    }
  }
}
```

## Tool Visibility

For plugin tools to be visible to agents:

```json
{
  "tools": {
    "allow": ["group:openclaw", "group:plugins"]
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"  // Required for plugin tools
      }
    }
  }
}
```

## Memory Plugins (Exclusive)

Memory plugins are special - only one can be active:

```typescript
export const plugin: OpenClawPluginDefinition = {
  id: "custom-memory",
  kind: "memory",  // Exclusive slot
  register: (api) => {
    // Override default memory handling
  }
};
```

## Provider Plugins

```typescript
api.registerProvider({
  id: "my-provider",
  label: "My LLM Provider",
  docsPath: "providers/my-provider",
  aliases: ["myp"],
  models: {
    "my-model": { contextWindow: 100000 }
  },
  auth: [
    {
      id: "api_key",
      label: "API Key",
      kind: "api_key",
      run: async (ctx) => {
        // Prompt for API key, return profiles
      }
    }
  ]
});
```

## Command Plugins

```typescript
api.registerCommand({
  name: "status",
  description: "Show system status",
  acceptsArgs: false,
  requireAuth: true,
  handler: async (ctx) => {
    return { text: "System is running" };
  }
});
```

## Service Plugins

```typescript
api.registerService({
  id: "my-service",
  start: async (ctx) => {
    // Start background work
    setInterval(() => { /* ... */ }, 60000);
  },
  stop: async (ctx) => {
    // Cleanup
  }
});
```

## CLI Extension

```typescript
api.registerCli(
  (ctx) => {
    ctx.program
      .command("my-cmd")
      .description("My custom command")
      .action(async () => { /* ... */ });
  },
  { commands: ["my-cmd"] }
);
```

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

```typescript
type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
};
```

Diagnostics are collected during load and reported via:
- Gateway logs
- `openclaw plugins status`
- Health endpoint

## Best Practices

1. **Use `optional: true`** for context-dependent tools
2. **Set hook priority** for ordering multiple handlers
3. **Validate config** with Zod schemas
4. **Handle cleanup** in `stop()` for services
5. **Mark sensitive config** with `uiHints.sensitive: true`
