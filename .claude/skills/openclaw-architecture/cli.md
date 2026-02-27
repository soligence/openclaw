# OpenClaw CLI & Commands Architecture

## Overview

OpenClaw's CLI is built on the [Commander.js](https://github.com/tj/commander.js) framework and uses a **lazy-loading, modular registration** pattern for performance. Commands are split into "core" commands (always available, baked into the main bundle) and "sub-CLI" commands (lazily imported on demand). A plugin system further extends the command tree at runtime.

---

## CLI Entry Point & Boot Sequence

**File:** `src/cli/run-main.ts` → `runCli()`

```
process.argv
   └─ normalizeWindowsArgv()         # Normalize Windows path separators / MSYS quoting
   └─ loadDotEnv()                   # Load .env file into process.env
   └─ normalizeEnv()                 # Normalize env vars
   └─ ensureOpenClawCliOnPath()      # Add CLI bin to PATH if missing
   └─ assertSupportedRuntime()       # Guard: Node/Bun minimum version check
   └─ tryRouteCli()                  # Check for early-exit routes (see Route System)
   └─ enableConsoleCapture()         # Redirect console.* to structured logs
   └─ buildProgram()                 # Construct Commander program
   └─ registerCoreCliByName()        # Eagerly register the primary subcommand
   └─ registerSubCliByName()         # Eagerly register sub-CLI for the primary
   └─ registerPluginCliCommands()    # Plugin-provided CLI commands
   └─ program.parseAsync()           # Parse argv and dispatch
```

**Key optimization:** `rewriteUpdateFlagArgv()` rewrites `--update` (legacy flag) to the `update` subcommand before parsing.

---

## Program Construction

**File:** `src/cli/program/build-program.ts`

`buildProgram()` creates a Commander root program, attaches a `ProgramContext` (version + channel options), configures custom help formatting, registers a global preAction hook, then registers both core and sub-CLI command groups.

### ProgramContext

**File:** `src/cli/program/context.ts`

The `ProgramContext` holds: `programVersion` (from VERSION constant), `channelOptions` (available messaging channels), `messageChannelOptions` (pipe-joined channel names), and `agentChannelOptions` (includes "last" prefix for agent routing).

---

## Command Registration Architecture

### Two-Tier System

Commands are organized into two tiers, both using **lazy placeholder registration** by default:

| Tier | Registration File | Lazy? | Scope |
|------|-------------------|-------|-------|
| Core CLI | `register.*.ts` files | Yes (unless help/version) | Primary user-facing commands |
| Sub-CLI | `register.subclis.ts` | Yes (unless `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS`) | Specialized subsystems |

### Lazy Registration Pattern

```
1. registerLazyCoreCommand() / registerLazyCommand()
   └─ Creates a Commander placeholder command
   └─ placeholder.allowUnknownOption(true) + allowExcessArguments(true)
   └─ On first invocation:
       a. removeCommand(program, placeholder)   // Remove placeholder
       b. entry.register({ program, ctx, argv }) // Load real module
       c. reparseProgramFromActionArgs()         // Re-dispatch original args
```

**Eager registration** is triggered by:
- `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS=1` env var
- `openclaw completion` command (needs full tree for script generation)

---

## Full CLI Command Tree

### Core Commands (always registered)

```
openclaw
├── setup          [register.setup.ts]
├── onboard        [register.onboard.ts]
├── configure      [register.configure.ts]
├── config         [config-cli.ts]
│   ├── get <key>
│   ├── set <key> <value>
│   └── unset <key>
├── doctor         [register.maintenance.ts → commands/doctor.ts]
│   Options: --yes, --repair/--fix, --force, --non-interactive,
│            --generate-gateway-token, --deep, --no-workspace-suggestions
├── dashboard      [register.maintenance.ts → commands/dashboard.ts]
│   Options: --no-open
├── reset          [register.maintenance.ts → commands/reset.ts]
│   Options: --scope, --yes, --non-interactive, --dry-run
├── uninstall      [register.maintenance.ts → commands/uninstall.ts]
│   Options: --service, --state, --workspace, --app, --all, --yes, --non-interactive, --dry-run
├── message        [register.message.ts]
│   ├── send       Options: --target, --message, --media, --channel
│   ├── broadcast
│   ├── poll       Options: --channel, --target, --poll-question, --poll-option
│   ├── react      Options: --channel, --target, --message-id, --emoji
│   ├── read
│   ├── edit
│   ├── delete
│   ├── pin / unpin
│   ├── permissions
│   ├── search
│   ├── thread
│   ├── emoji
│   ├── sticker
│   └── discord-admin
├── memory         [memory-cli.ts]
│   └── status     Options: --json
├── agent          [register.agent.ts → commands/agent-via-gateway.ts]
│   Options: -m/--message, -t/--to, --session-id, --agent, --thinking,
│            --verbose, --channel, --reply-to, --reply-channel, --reply-account,
│            --local, --deliver, --json, --timeout
├── agents         [register.agent.ts → commands/agents.ts]
│   ├── list       Options: --json, --bindings
│   ├── add [name] Options: --workspace, --model, --agent-dir, --bind, --non-interactive, --json
│   ├── set-identity Options: --agent, --workspace, --identity-file, --from-identity,
│   │               --name, --theme, --emoji, --avatar, --json
│   └── delete <id> Options: --force, --json
├── status         [register.status-health-sessions.ts → commands/status.ts]
│   Options: --json, --all, --usage, --deep, --timeout, --verbose, --debug
├── health         [register.status-health-sessions.ts → commands/health.ts]
│   Options: --json, --timeout, --verbose, --debug
├── sessions       [register.status-health-sessions.ts → commands/sessions.ts]
│   Options: --json, --verbose, --store, --active
└── browser        [browser-cli.ts]
    ├── open / navigate
    ├── screenshot
    ├── observe
    ├── inspect
    ├── debug
    ├── resize
    ├── manage
    └── state.*
```

### Sub-CLI Commands (lazily loaded)

```
openclaw
├── acp            Agent Control Protocol tools
│   └── [acp-cli.ts]
├── gateway        Gateway WebSocket server & control
│   ├── (run)      Run the WebSocket Gateway (foreground)
│   ├── start/stop/restart/status  Service lifecycle
│   ├── call <method>  Options: --params, --url, --token, --timeout, --json
│   ├── usage-cost     Options: --days
│   ├── health
│   ├── probe          Options: --url, --ssh, --ssh-identity, --ssh-auto, --token, --password, --timeout, --json
│   └── discover       Options: --timeout, --json
├── daemon         Legacy alias for gateway service management
├── logs           Gateway logs viewer
├── system         System events, heartbeat, and presence
├── models         Model configuration
│   ├── list
│   ├── set
│   └── status
├── approvals      Exec approval management
├── nodes          Multi-node control
├── devices        Device pairing + token management
├── node           Single node control
├── sandbox        Sandbox tools (Docker/Podman)
├── tui            Terminal UI (see TUI section)
│   Options: --url, --token, --password, --session, --deliver, --thinking,
│            --message, --timeout-ms, --history-limit
├── cron           Cron scheduler
├── dns            DNS helpers
├── docs           Documentation helpers
├── hooks          Hooks tooling
├── webhooks       Webhook helpers
├── pairing        Channel pairing
├── plugins        Plugin management
│   ├── list       Options: --json, --enabled, --verbose
│   ├── info
│   ├── install <spec>
│   ├── uninstall <name>
│   └── update
├── channels       Channel management
├── directory      Directory/contacts commands
├── security       Security helpers
├── skills         Skills management
├── update         CLI self-update
└── completion     Shell completion script generation
    Options: -s/--shell (zsh|bash|powershell|fish), -i/--install,
             --write-state, -y/--yes
```

---

## preAction Global Hook

**File:** `src/cli/program/preaction.ts`

Runs before every command action:

```
preAction hook
├── setProcessTitleForCommand()      # Sets process.title = "openclaw-{command}"
├── emitCliBanner()                  # Print version/tagline (suppressed for: update, completion, plugins update)
├── setVerbose()                     # Global verbose flag from --verbose/--debug
├── ensureConfigReady()              # Validate config exists + run state migrations
│   (skipped for: doctor, completion)
└── ensurePluginRegistryLoaded()     # Load channel plugins
    (only for: message, channels, directory)
```

Commands exempt from config guard: `doctor`, `completion`

---

## Gateway RPC Protocol

### callGateway()

**Files:** `src/cli/gateway-rpc.ts`, `src/cli/gateway-cli/call.ts`

All CLI-to-Gateway communication goes through a single WebSocket RPC call. The `callGateway()` function accepts: optional `url` (defaults to gateway.remote.url from config), auth credentials (`token` or `password`), `method` (RPC method name like "health", "usage.cost", "cron.*"), optional JSON `params`, `expectFinal` flag (wait for agent final response), `timeoutMs` (default 10000ms), `clientName` ("cli"), and `mode` ("cli").

### Standard Gateway Options (added to commands via `gatewayCallOpts`)

```
--url <url>        Gateway WebSocket URL (overrides config)
--token <token>    Authentication token
--password <pw>    Password authentication
--timeout <ms>     Timeout (default: 10000ms)
--expect-final     Wait for agent final reply
--json             JSON output mode
```

### Progress Display

`withProgress()` wraps gateway calls with an indeterminate spinner, suppressed when `--json` flag is present.

### Gateway Discovery

`gateway discover` uses Bonjour/mDNS (`discoverGatewayBeacons()`) plus optional wide-area DNS discovery for finding local and remote gateways on the network.

---

## Doctor Command Architecture

**File:** `src/commands/doctor.ts`

The `doctor` command is a comprehensive diagnostic and repair wizard:

```
doctorCommand()
├── maybeOfferUpdateBeforeDoctor()      # Prompt to update CLI first
├── loadAndMaybeMigrateDoctorConfig()   # Config migration
├── resolveMode() → "local" | "remote"
├── Doctor checks (sequential):
│   ├── noteSourceInstallIssues()       # Check installation integrity
│   ├── maybeRepairAnthropicOAuthProfileId() # Auth profile repair
│   ├── maybeRemoveDeprecatedCliAuthProfiles()
│   ├── noteAuthProfileHealth()         # Provider auth status
│   ├── maybeRepairGatewayServiceConfig()   # Service config
│   ├── maybeScanExtraGatewayServices() # Detect duplicate installs
│   ├── maybeRepairGatewayDaemon()      # Daemon state
│   ├── checkGatewayHealth()            # Live health probe
│   ├── maybeRepairSandboxImages()      # Docker/Podman images
│   ├── noteSandboxScopeWarnings()
│   ├── noteSecurityWarnings()          # Security config warnings
│   ├── noteStateIntegrity()            # State dir integrity
│   ├── detectLegacyStateMigrations() / runLegacyStateMigrations()
│   ├── noteMacLaunchAgentOverrides()   # macOS launchctl overrides
│   ├── noteDeprecatedLegacyEnvVars()
│   ├── noteMemorySearchHealth()
│   ├── noteWorkspaceStatus()
│   ├── shouldSuggestMemorySystem()
│   ├── doctorShellCompletion()         # Completion install check
│   ├── maybeRepairUiProtocolFreshness()
│   └── ensureSystemdUserLingerInteractive() # Linux systemd
└── outro()
```

**Options:** `--yes`, `--repair`/`--fix`, `--force`, `--non-interactive`, `--generate-gateway-token`, `--deep`

---

## TUI Architecture

**Files:** `src/tui/`, `src/cli/tui-cli.ts`

The TUI (`openclaw tui`) opens a full terminal UI backed by the [`@mariozechner/pi-tui`](https://github.com/mariozechner/pi-tui) library.

### TUI Component Hierarchy

```
TUI (pi-tui)
├── Container
│   ├── ChatLog              [components/chat-log.ts]
│   │   ├── System messages
│   │   ├── User messages
│   │   └── Assistant stream deltas
│   ├── CustomEditor         [components/custom-editor.ts]
│   │   ├── Text input with history (up/down)
│   │   ├── Slash command autocomplete
│   │   └── Submit handler
│   └── Overlays             [tui-overlays.ts]
│       ├── Agent selector
│       ├── Session selector
│       ├── Model selector
│       └── Settings panel
├── Loader (indeterminate waiting spinner)
├── ProcessTerminal (bash "!" mode)
└── Text (status bar)
```

### Input Modes

| Input | Trigger | Behavior |
|-------|---------|----------|
| Normal text | Any non-prefixed input | Sent as chat message to agent |
| Slash command | Leading `/` | Parsed and dispatched to command handler |
| Bang/shell mode | Leading `!` (raw text, not just `!`) | Runs in local shell via `ProcessTerminal` |

### Slash Commands (TUI)

**File:** `src/tui/commands.ts`

```
/help              Show command help
/status            Show gateway status summary
/agent <id>        Switch agent (or open picker)
/agents            Open agent picker overlay
/session <key>     Switch session (or open picker)
/sessions          Open session picker overlay
/model <ref>       Set model (or open picker)
/models            Open model picker overlay
/think <level>     Set thinking level (provider/model-aware)
/verbose <on|off>  Toggle verbose logging
/reasoning <on|off> Toggle reasoning display
/usage <off|tokens|full>  Response usage footer
/elevated <on|off|ask|full>  Elevated execution mode
/elev              Alias for /elevated
/activation <mention|always>  Group activation mode
/abort             Abort active agent run
/new or /reset     Reset session
/settings          Open settings overlay
/exit or /quit     Exit TUI
```

Plus any commands registered via the auto-reply commands registry.

### TUI State Model

**File:** `src/tui/tui-types.ts`

The TUI state tracks: agent default ID, session main key, session scope, agents list, current agent/session IDs, active chat run ID, history loaded flag, session info, connection and activity status, tool expansion and thinking display toggles, and Ctrl-C tracking for exit.

### GatewayChatClient

**File:** `src/tui/gateway-chat.ts`

The TUI connects to the gateway via `GatewayChatClient`, which wraps `GatewayClient` (WebSocket):

```
GatewayChatClient
├── connect()               WebSocket handshake + HELLO
├── sendMessage()           Chat message → gateway
├── listSessions()          Fetch session list
├── listAgents()            Fetch agent list
├── listModels()            Fetch available models
├── abortRun()              Cancel active agent turn
├── patchSession()          Update session settings
└── on('event')             Stream events: delta | final | aborted | error
```

### Submit Burst Coalescer

`createSubmitBurstCoalescer()` — a 50ms window coalescer that batches rapid consecutive submissions (e.g., paste events on Windows/Git Bash) into a single newline-separated message.

### Session Key Resolution

`resolveTuiSessionKey()` maps `--session` option + agent scope to the gateway session key format (`{agentId}:{sessionKey}`).

---

## Shell Completion

**File:** `src/cli/completion-cli.ts`

Supported shells: **zsh**, **bash**, **fish**, **PowerShell**

```
openclaw completion
├── --shell <shell>      Target shell (default: auto-detected from $SHELL)
├── --install / -i       Install to shell profile (~/.zshrc, ~/.bashrc, etc.)
├── --write-state        Write cached script to $OPENCLAW_STATE_DIR/completions/
└── -y / --yes           Non-interactive (skip prompts)
```

### Completion Generation Flow

```
1. Force-register ALL core + sub-CLI commands (bypass lazy loading)
2. Generate completion script from full Commander tree
3. Either:
   a. Write to stdout (default)
   b. Cache to $OPENCLAW_STATE_DIR/completions/{name}.{ext}
   c. Install source line to shell profile
```

### Profile Management

The installer adds/updates an `# OpenClaw Completion` section in the shell profile that sources the cached completion script. It detects and migrates "slow dynamic completion" (inline `source <(...)`) to the faster cached approach.

---

## Plugin Extension Points

**File:** `src/plugins/cli.ts` (referenced from `run-main.ts`)

Plugins can register custom CLI commands via `registerPluginCliCommands(program, config)`. This is called:
- After core + sub-CLI registration in `runCli()`
- Before argument parsing so plugin commands appear in help
- Also called during `pairing` and `plugins` sub-CLI loading

**Plugin command registration conditions:**
- Skipped if a builtin primary command matched (plugins don't override builtins)
- Skipped on `--help`/`--version` (to avoid unnecessary plugin loading)
- Always called when no primary command matched (plugin might provide it)

---

## Interactive vs. Non-Interactive Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Interactive (default) | TTY detected | Prompts, wizard flows, confirmations |
| Non-interactive | `--non-interactive` flag | Requires all params as flags; errors on missing |
| Yes-mode | `--yes` flag | Accepts all defaults without prompting |
| JSON output | `--json` flag | Machine-readable output, suppresses banners |
| TUI | `openclaw tui` | Full terminal UI with persistent connection |

---

## Route System (Early Exit)

**File:** `src/cli/route.ts`

`tryRouteCli()` is called before Commander and can short-circuit the CLI for special cases (e.g., direct binary delegation, platform-specific routing).

---

## Argv Utilities

**File:** `src/cli/argv.ts`

Key utilities used throughout the CLI:

| Function | Purpose |
|----------|---------|
| `getPrimaryCommand(argv)` | Extract first non-flag argument |
| `getCommandPath(argv, depth)` | Extract N-level command path |
| `hasHelpOrVersion(argv)` | Detect `-h`/`--help`/`-v`/`-V` |
| `hasFlag(argv, name)` | Check for specific flag |
| `getFlagValue(argv, name)` | Get flag value |
| `buildParseArgv(params)` | Normalize argv for Commander |
| `shouldMigrateState(argv)` | Decide if state migration needed |

---

## Key Files Reference

| File | Role |
|------|------|
| `src/cli/run-main.ts` | CLI entry: boot sequence + plugin registration |
| `src/cli/program/build-program.ts` | Commander program construction |
| `src/cli/program/command-registry.ts` | Core command lazy registration |
| `src/cli/program/register.subclis.ts` | Sub-CLI lazy registration (30+ subsystems) |
| `src/cli/program/preaction.ts` | Global preAction hook (banner, verbose, config guard) |
| `src/cli/program/context.ts` | ProgramContext (version, channel options) |
| `src/cli/program/action-reparse.ts` | Re-dispatch after lazy load |
| `src/cli/gateway-rpc.ts` | Legacy gateway RPC helpers |
| `src/cli/gateway-cli/call.ts` | Gateway call with progress spinner |
| `src/cli/gateway-cli/register.ts` | `gateway` command tree |
| `src/cli/completion-cli.ts` | Shell completion for zsh/bash/fish/PowerShell |
| `src/cli/tui-cli.ts` | TUI CLI registration |
| `src/cli/argv.ts` | argv parsing utilities |
| `src/tui/tui.ts` | TUI main: submit handler, coalescer, session key resolution |
| `src/tui/commands.ts` | Slash command definitions |
| `src/tui/gateway-chat.ts` | WebSocket gateway client for TUI |
| `src/tui/tui-types.ts` | TUI state type definitions |
| `src/tui/tui-command-handlers.ts` | Slash command dispatch logic |
| `src/tui/tui-event-handlers.ts` | Gateway event processing |
| `src/commands/doctor.ts` | Doctor diagnostic command |
| `src/commands/status.ts` | Status command |
| `src/commands/health.ts` | Health command |
| `src/commands/agent-via-gateway.ts` | Agent CLI command |
| `src/commands/agents.ts` | Agents management commands |
