# OpenClaw Agent & Tool System Architecture

> Deep research document — sourced from `src/agents/` in the openclaw-official repository.

---

## 1. Agent Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INCOMING MESSAGE / TRIGGER                       │
│     (Slack, Telegram, Discord, WhatsApp, iMessage, CLI, Cron, API)      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROUTING LAYER                                    │
│   session-key resolution → agent-scope.ts → resolveSessionAgentIds()    │
│   Session key format: agent:<agentId>:<channel>:<kind>:<groupId>        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      runEmbeddedPiAgent()                                │
│                  pi-embedded-runner/run.ts                               │
│                                                                          │
│  1. Resolve session lane (per-session queue) + global lane               │
│  2. enqueueSession() → enqueueGlobal() — serialized execution            │
│  3. Resolve workspace directory                                          │
│  4. Resolve model (provider + modelId)                                   │
│  5. Evaluate context window guard                                        │
│  6. Resolve auth profile order (rotation support)                        │
│  7. Loop over auth profile candidates (failover)                         │
│     └─ runEmbeddedAttempt()                                              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      runEmbeddedAttempt()                                │
│              pi-embedded-runner/run/attempt.ts                           │
│                                                                          │
│  1. Prepare SessionManager (history + write-lock)                        │
│  2. Repair session file if corrupted                                     │
│  3. Limit history turns (DM limits, context overflow)                    │
│  4. Build system prompt (bootstrap files, skills, identity)              │
│  5. Resolve sandbox context                                              │
│  6. CREATE TOOLS via createOpenClawCodingTools()                         │
│  7. Apply tool policy pipeline (filter tools by policy)                  │
│  8. Wrap tools with before_tool_call hooks                               │
│  9. Convert tools to SDK definitions (toClientToolDefinitions)           │
│  10. Call LLM provider (streamSimple / pi-ai)                            │
│  11. Subscribe to stream events (subscribeEmbeddedPiSession)             │
│  12. Handle tool calls → execute → inject results                        │
│  13. Compact session on context overflow                                  │
│  14. Return EmbeddedPiRunResult                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tool Registration & Resolution Pipeline

Tools are assembled in `createOpenClawCodingTools()` (`src/agents/pi-tools.ts`), then filtered through the policy pipeline.

### 2.1 Tool Assembly Order

```
createOpenClawCodingTools()
│
├── [1] Coding Tools (from @mariozechner/pi-coding-agent)
│       read, write, edit, glob, grep, ls, task, ...
│       (sandbox-aware variants injected when sandbox is active)
│
├── [2] exec (bash execution)
│       createExecTool() — with optional PTY, elevated, sandbox routing
│
├── [3] process (background process management)
│       createProcessTool() — scoped by sessionKey
│
├── [4] apply_patch (OpenAI codex patch format)
│       createApplyPatchTool() — gated: only enabled for OpenAI provider + allow-list
│
├── [5] Channel-docked tools
│       listChannelAgentTools() — channel-specific tools (e.g. whatsapp_login)
│
└── [6] OpenClaw Native Tools — createOpenClawTools()
        ├── image          (image generation/capture)
        ├── web_search     (web search integration)
        ├── web_fetch      (URL fetching)
        ├── browser        (headless browser / CDP)
        ├── canvas         (canvas rendering)
        ├── nodes          (node graph)
        ├── cron           (task scheduling)
        ├── message        (messaging surface)
        ├── gateway        (admin gateway)
        ├── agents_list    (list known agents)
        ├── sessions_list  (list sessions)
        ├── sessions_history (session history)
        ├── sessions_send  (cross-session messaging)
        ├── sessions_spawn (spawn sub-agents)
        ├── subagents      (list/manage sub-agents)
        ├── session_status (current session status)
        ├── memory_search  (vector memory search)
        ├── memory_get     (memory retrieval)
        ├── tts            (text-to-speech)
        └── Plugin Tools   (from resolvePluginTools())
```

### 2.2 Tool Type System

Each tool (AgentTool) has four required fields: `name`, `description`, `schema` (JSON Schema for parameters), and `execute` (async function receiving toolCallId, params, signal, and onUpdate callback, returning an AgentToolResult).

An AgentToolResult contains: `content` (array of text or image blocks), optional `details`, and optional `isError` flag.

---

## 3. Policy Pipeline — The Full Chain

The policy system is layered: each layer can restrict (deny) or permit (allow) tools. **All layers must pass** — a tool is included only if every applicable policy allows it.

### 3.1 Policy Types

A tool policy is an object with optional `allow` and `deny` string arrays. Both `SandboxToolPolicy` and `ToolPolicyLike` follow this shape.

### 3.2 Policy Resolution Order (pi-tools.policy.ts → tool-policy-pipeline.ts)

```
resolveEffectiveToolPolicy()
│
├── globalPolicy          ← config.tools.allow / .deny
├── globalProviderPolicy  ← config.tools.byProvider[provider].allow / .deny
├── agentPolicy           ← config.agents[agentId].tools.allow / .deny
└── agentProviderPolicy   ← config.agents[agentId].tools.byProvider[provider].allow/.deny

resolveGroupToolPolicy()
└── groupPolicy           ← channel group config (e.g. Slack workspace-level rules)

resolveSubagentToolPolicy()
└── subagentPolicy        ← automatic deny-list for sub-agents (see §3.4)
```

### 3.3 Pipeline Execution (applyToolPolicyPipeline)

Seven sequential filter steps are defined in `buildDefaultToolPolicyPipelineSteps()`:

```
Step 1: tools.profile          → pre-built profiles (minimal/coding/messaging/full)
Step 2: tools.byProvider.profile
Step 3: tools.allow            → global allow/deny
Step 4: tools.byProvider.allow → provider-specific allow/deny
Step 5: agents.<id>.tools.allow → per-agent override
Step 6: agents.<id>.tools.byProvider.allow
Step 7: group tools.allow      → channel-group (Slack, Discord, etc.)
```

For each step:
1. `stripPluginOnlyAllowlist()` — prevents allowlists that contain only plugin tools from accidentally disabling core tools
2. `expandPolicyWithPluginGroups()` — expands `group:plugins` and plugin-id shortcuts
3. `filterToolsByPolicy()` — applies allow/deny glob matching

Plus the sandbox tool policy is applied as an additional dimension (not in the main pipeline, but checked independently via `isToolAllowedByPolicies()`).

### 3.4 Tool Matching Logic (makeToolPolicyMatcher)

```
function match(name):
  normalized = normalizeToolName(name)   // lowercase, alias-resolved
  if matches any deny pattern → REJECT
  if allow list is empty → ALLOW (open)
  if matches any allow pattern → ALLOW
  if name == "apply_patch" AND "exec" in allow → ALLOW (special case)
  → REJECT
```

Patterns support glob syntax (`*`, `?`, `**`). Tool name aliases:
- `bash` → `exec`
- `apply-patch` → `apply_patch`

### 3.5 Tool Groups (Expandable in Policy Config)

```
group:memory   → [memory_search, memory_get]
group:web      → [web_search, web_fetch]
group:fs       → [read, write, edit, apply_patch]
group:runtime  → [exec, process]
group:sessions → [sessions_list, sessions_history, sessions_send, sessions_spawn, subagents, session_status]
group:ui       → [browser, canvas]
group:automation → [cron, gateway]
group:messaging  → [message]
group:nodes    → [nodes]
group:openclaw → [all native OpenClaw tools]
group:plugins  → [all plugin-registered tools]
```

### 3.6 Built-in Tool Profiles

```
minimal  → allow: [session_status]
coding   → allow: [group:fs, group:runtime, group:sessions, group:memory, image]
messaging → allow: [group:messaging, sessions_list, sessions_history, sessions_send, session_status]
full     → no restrictions (allow: *)
```

### 3.7 Sub-Agent Tool Restrictions (pi-tools.policy.ts)

Sub-agents receive automatic deny-lists based on depth:

```
SUBAGENT_TOOL_DENY_ALWAYS (all sub-agents):
  gateway, agents_list, whatsapp_login,
  session_status, cron, memory_search, memory_get, sessions_send

SUBAGENT_TOOL_DENY_LEAF (leaf agents at max depth):
  + sessions_list, sessions_history, sessions_spawn

maxSpawnDepth is configurable: config.agents.defaults.subagents.maxSpawnDepth
```

Orchestrator sub-agents (depth < maxSpawnDepth) retain `sessions_spawn` to manage children.

### 3.8 Owner-Only Tools

`whatsapp_login` is restricted to "owner" senders via `applyOwnerOnlyToolPolicy()`. Non-owners see it filtered from the tool list entirely; the tool is not just blocked — it is invisible.

---

## 4. Sandbox Architecture

### 4.1 Sandbox Context

The SandboxContext contains:

| Field | Description |
|-------|-------------|
| `enabled` | Whether sandbox is active |
| `sessionKey` | Current session identifier |
| `workspaceDir` | Host-side workspace path |
| `agentWorkspaceDir` | Agent-specific workspace path |
| `workspaceAccess` | Access level: `"none"`, `"ro"`, or `"rw"` |
| `containerName` | Docker/Podman container name |
| `containerWorkdir` | Path inside the container |
| `docker` | Docker/Podman configuration |
| `tools` | Separate allow/deny for sandboxed tools |
| `browserAllowHostControl` | Whether CDP bridge is enabled |
| `browser` | Optional sandbox browser context |
| `fsBridge` | Optional filesystem proxy for sandboxed reads/writes |

### 4.2 Sandbox Scope Modes

```
"session"  → one container per session (max isolation)
"agent"    → one container per agent (default)
"shared"   → shared container across agents (lower isolation)
```

### 4.3 Docker Configuration

Key security defaults:
- `network: "none"` — no network inside sandbox by default
- `readOnlyRoot: true` — immutable root filesystem
- `capDrop: ["ALL"]` — all Linux capabilities dropped
- `tmpfs: ["/tmp", "/var/tmp", "/run"]` — writable temp space only
- Configurable: `seccompProfile`, `apparmorProfile`, `ulimits`, `pidsLimit`, `memory`

### 4.4 Sandbox Tool Policy

Sandboxed agents have their own tool allow/deny separate from the main policy pipeline. Resolution order: agent-level config (`agents[].tools.sandbox.tools.allow/deny`) takes priority, then global config (`tools.sandbox.tools.allow/deny`), then DEFAULT_TOOL_ALLOW / DEFAULT_TOOL_DENY constants. The `image` tool is always included unless explicitly denied (multimodal support).

### 4.5 Filesystem Bridge

Sandboxed filesystem operations go through `SandboxFsBridge` — a proxy layer that translates host-path read/write/edit operations into container-scoped operations, preventing path traversal outside the workspace.

---

## 5. Provider Abstraction Layer

### 5.1 Model Resolution Chain

```
resolveModel(provider, modelId, agentDir, config)
│
├── discoverAuthStorage(agentDir)  → find API keys / OAuth tokens
├── discoverModels(authStorage, agentDir)  → build ModelRegistry
│     (includes built-in + custom models.json entries)
│
├── modelRegistry.find(provider, modelId)  → direct lookup
│
├── [fallback] buildInlineProviderModels(config.models.providers)
│     → inline model definitions from openclaw.yaml
│
├── [fallback] resolveForwardCompatModel()
│     → handles provider version aliases
│
└── [fallback] provider config generic API
      → for providers with baseUrl + api shape defined in config
```

### 5.2 Supported Provider Types

Providers are abstracted behind the `@mariozechner/pi-ai` `Api`/`Model` interface:

| Provider | Notes |
|---|---|
| Anthropic | Native Claude API, OAuth, prompt caching |
| OpenAI | Completions + Responses API (reasoning replay) |
| Google Gemini | Turn ordering sanitization, thinking block stripping |
| Ollama | Local models via native stream adapter |
| Bedrock | AWS-discovered auth |
| GitHub Copilot | OAuth token auto-injection |
| HuggingFace | Model catalog integration |
| MiniMax | VLM with API key normalization |
| NVIDIA | Model catalog |
| Qianfan | OAuth |
| vLLM | OpenAI-compatible endpoint |
| ZAI | Alias profiles |
| Venice | Defined model list |
| Together | Defined model list |
| Cloudflare AI Gateway | Proxied gateway |

### 5.3 Auth Profile Rotation

Auth profiles are tried in order via `resolveAuthProfileOrder()`. For each candidate: check cooldown status, retrieve API key, attempt the LLM call. On auth/billing failure, mark the profile failed and try the next. On success, mark it good.

### 5.4 LLM Call Interface

All providers are called via `streamSimple()` from `@mariozechner/pi-ai`, which returns an async event stream with events: `text_delta` (streaming text), `tool_call_start` (tool invocation begins), `tool_call_delta` (streaming args), `tool_call_end` (complete args, ready to execute), `message_end` (turn complete with stop_reason and usage), and `error` (stream error).

---

## 6. Session & Context Management

### 6.1 Session Key Structure

```
Format: agent:<agentId>:<channel>:<kind>:<groupId>[:<thread>]

Examples:
  agent:main:slack:group:C1234ABCD         → Slack channel session
  agent:main:subagent:slack:group:C1234    → Sub-agent session
  agent:main:telegram:group:123:topic:456  → Telegram topic session
  probe-<id>                               → Probe/health-check session
```

### 6.2 Session Lifecycle

```
acquireSessionWriteLock(sessionKey)
→ exclusive write access per session (prevents concurrent writes)

SessionManager (from @mariozechner/pi-coding-agent)
→ reads/writes the session JSON transcript file
→ tracks messages as alternating user/assistant turns
→ repairSessionFileIfNeeded() — fixes corrupted transcripts
→ sanitizeToolUseResultPairing() — repairs orphaned tool results

On context overflow:
→ compactEmbeddedPiSessionDirect() — summarize + truncate history
→ flushPendingToolResultsAfterIdle() — drain pending results before flush
```

### 6.3 History Management

```
limitHistoryTurns(messages, limit)   → cap message count
getDmHistoryLimitFromSessionKey()     → per-DM context limits
truncateOversizedToolResultsInSession() → trim large tool results
sessionLikelyHasOversizedToolResults() → detect before attempt
```

### 6.4 System Prompt Construction

```
buildSystemPromptParams()
├── Bootstrap context files (workspace CLAUDE.md, etc.)
├── Skills prompt (workspace + bundled skills)
├── Identity configuration (name, persona)
├── Tool availability hints
├── Channel capabilities (markdown, images, threading)
├── Machine display name
├── Current date/time
└── Sandbox info (if sandboxed)
```

### 6.5 Compaction

When context approaches overflow, the session is compacted:
1. LLM summarizes the conversation history
2. Summary replaces old turns in the transcript
3. Run continues from the compaction point
4. Up to N compaction retries before hard failure

---

## 7. Before-Tool-Call Hook Pipeline

Every tool call passes through `wrapToolWithBeforeToolCallHook()`:

```
Tool Invocation
     │
     ▼
runBeforeToolCallHook(toolName, params, toolCallId, ctx)
     │
     ├── hookRunner.hasHooks("before_tool_call")?
     │       NO  → pass through unchanged
     │       YES ↓
     │
     ├── hookRunner.runBeforeToolCall(...)
     │       → returns { block, blockReason } OR { params } (modified)
     │
     ├── block == true  → throw error (tool blocked)
     ├── params changed → merge and forward new params
     └── no change      → forward original params
     │
     ▼
tool.execute(toolCallId, params, signal, onUpdate)
```

Plugins register hooks via `getGlobalHookRunner()`. This enables:
- Security auditing of all tool invocations
- Dynamic parameter rewriting
- Blocking specific operations based on business logic

---

## 8. Sub-Agent Spawn Architecture

```
sessions_spawn tool (tools/sessions-spawn-tool.ts)
│
├── Validates depth limit (subagent-depth.ts)
│     getSubagentDepthFromSessionStore() — walks spawnedBy chain
│
├── Creates new session key with subagent prefix
├── Records spawnDepth in session store
├── Applies SUBAGENT_TOOL_DENY_ALWAYS automatically
│
└── Orchestrator vs Leaf determination:
      depth < maxSpawnDepth → orchestrator (can spawn children)
      depth >= maxSpawnDepth → leaf (cannot spawn, no session tools)
```

Sub-agents communicate back through the announce chain (`subagent-announce.ts`), not via direct `sessions_send` (which is denied).

---

## 9. Tool Execution Event Flow (subscribeEmbeddedPiSession)

```
LLM Stream Event: tool_call_start
     │
     ▼
handleToolExecutionStart()
├── flushBlockReplyBuffer()  (preserve message boundaries)
├── Store start time + args  (for after_tool_call hook timing)
├── Build ToolCallSummary    (mutation fingerprint)
├── emitAgentEvent("tool_start")
└── Notify UI/channel

LLM Stream Event: tool_call_end (args complete)
     │
     ▼
tool.execute(toolCallId, params, signal, onUpdate)
     │  (runs through before_tool_call hook first)
     │
     ▼
handleToolResult()
├── Extract text + media paths from result
├── Detect messaging tool sends (suppress confirmation text)
├── Run after_tool_call plugin hook
├── emitAgentEvent("tool_result")
└── Inject result back into session → trigger next LLM turn
```

---

## 10. Key Source File Map

| File | Role |
|---|---|
| `src/agents/pi-tools.ts` | Tool assembly entry point (`createOpenClawCodingTools`) |
| `src/agents/openclaw-tools.ts` | Native OpenClaw tool factory |
| `src/agents/tool-policy.ts` | Tool groups, profiles, alias normalization |
| `src/agents/pi-tools.policy.ts` | Policy resolution (global/agent/group/subagent) |
| `src/agents/tool-policy-pipeline.ts` | Multi-step policy filter engine |
| `src/agents/pi-embedded-runner/run.ts` | Top-level agent run orchestrator |
| `src/agents/pi-embedded-runner/run/attempt.ts` | Single LLM attempt (tools, session, stream) |
| `src/agents/pi-tools.before-tool-call.ts` | Before-tool-call hook wrapper |
| `src/agents/pi-tool-definition-adapter.ts` | Tool → SDK definition adapter |
| `src/agents/sandbox/` | Docker sandbox management |
| `src/agents/sandbox/tool-policy.ts` | Sandbox-specific tool policy resolution |
| `src/agents/sandbox/types.ts` | Sandbox context type definitions |
| `src/agents/agent-scope.ts` | Agent ID resolution, per-agent config lookup |
| `src/agents/subagent-depth.ts` | Sub-agent spawn depth tracking |
| `src/agents/pi-embedded-runner/model.ts` | Model resolution + provider abstraction |
| `src/agents/memory-search.ts` | Memory/vector search configuration |
| `src/agents/tools/` | Individual tool implementations |
| `src/agents/pi-embedded-subscribe.handlers.tools.ts` | Tool event stream handling |
