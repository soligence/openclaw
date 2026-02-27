# OpenClaw Channel Integration Architecture

## Overview

OpenClaw uses a plugin-based channel architecture. Each messaging platform (Telegram, WhatsApp, Discord, etc.) is implemented as a separate npm package in `extensions/<channel>/` that registers a `ChannelPlugin` object through the plugin SDK. The core runtime (`src/channels/`) defines the contracts, routing, and delivery plumbing — channels plug in, they do not live in the core.

---

## Channel Plugin Interface Diagram (ASCII)

```
extensions/<channel>/
├── index.ts                  <-- Plugin entrypoint: registers plugin via api.registerChannel()
├── openclaw.plugin.json      <-- Manifest: id, channels[], configSchema
├── package.json
└── src/
    ├── channel.ts            <-- ChannelPlugin implementation (the main contract)
    └── runtime.ts            <-- Module-scoped PluginRuntime accessor (get/setRuntime)

                   ┌────────────────────────────────────────────┐
                   │           ChannelPlugin<Account>            │
                   ├────────────────────────────────────────────┤
                   │  id: ChannelId                             │
                   │  meta: ChannelMeta                         │
                   │  capabilities: ChannelCapabilities         │
                   ├────────────────────────────────────────────┤
  Lifecycle        │  config:     ChannelConfigAdapter          │ account resolution, enable/disable
  & Setup          │  setup?:     ChannelSetupAdapter           │ wizard input → config write
                   │  onboarding?: ChannelOnboardingAdapter     │ CLI wizard hooks
                   │  pairing?:   ChannelPairingAdapter         │ allow-from ID normalization
                   ├────────────────────────────────────────────┤
  Security &       │  security?:  ChannelSecurityAdapter        │ DM policy, warnings
  Access           │  elevated?:  ChannelElevatedAdapter        │ elevated allow-from fallback
                   │  commands?:  ChannelCommandAdapter         │ owner-only, skip-when-empty
                   ├────────────────────────────────────────────┤
  Inbound          │  groups?:    ChannelGroupAdapter           │ require-mention, tool policy
  Behavior         │  mentions?:  ChannelMentionAdapter         │ strip mention patterns/text
                   │  threading?: ChannelThreadingAdapter       │ reply-to mode, tool context
                   ├────────────────────────────────────────────┤
  Outbound         │  outbound?:  ChannelOutboundAdapter        │ sendText, sendMedia, sendPoll
  Delivery         │  actions?:   ChannelMessageActionAdapter   │ send, react, edit, poll, pin…
                   │  streaming?: ChannelStreamingAdapter       │ block-streaming coalesce tuning
                   ├────────────────────────────────────────────┤
  Runtime          │  gateway?:   ChannelGatewayAdapter         │ startAccount, logoutAccount
  & Status         │  status?:    ChannelStatusAdapter          │ probe, audit, snapshot
                   │  heartbeat?: ChannelHeartbeatAdapter       │ checkReady, resolveRecipients
                   │  auth?:      ChannelAuthAdapter            │ login (QR, token, etc.)
                   ├────────────────────────────────────────────┤
  Discovery        │  directory?: ChannelDirectoryAdapter       │ listPeers, listGroups, self
  & Tools          │  resolver?:  ChannelResolverAdapter        │ resolveTargets (name→id)
                   │  messaging?: ChannelMessagingAdapter       │ normalizeTarget, looksLikeId
                   │  agentPrompt?: ChannelAgentPromptAdapter   │ messageToolHints for agent
                   │  agentTools?: ChannelAgentTool[]           │ channel-owned agent tools
                   └────────────────────────────────────────────┘
```

---

## Message Routing Architecture

### Inbound Flow

```
Platform API (Telegram Bot API / WhatsApp Baileys / Discord gateway / etc.)
    │
    ▼
Channel Monitor  (e.g. src/telegram/monitor.ts)
    │  Receives raw platform events; normalizes to MsgContext
    ▼
MsgContext (src/auto-reply/templating.ts)
    │  Fields: Body, From, To, SessionKey, AccountId, ChatType,
    │          MediaPaths, ReplyToId, GroupSubject, Provider, …
    ▼
dispatchInboundMessage()  (src/auto-reply/dispatch.ts)
    │
    ├─► finalizeInboundContext()       normalize text, chatType, conversation label, media types
    │
    ├─► shouldSkipDuplicateInbound()   deduplication (MessageSid-based)
    │
    ├─► tryFastAbortFromMessage()      user abort signal check
    │
    ├─► dispatchReplyFromConfig()      (src/auto-reply/reply/dispatch-from-config.ts)
    │       │
    │       ├─► initSessionState()     load/create session, resolve session key, group key
    │       │       └── resolveGroupRequireMention() → ChannelDock.groups
    │       │
    │       ├─► resolveCommandAuthorization()
    │       │
    │       ├─► getReplyFromConfig()   (src/auto-reply/reply.ts)
    │       │       │
    │       │       ├─► directive handling (model, elevated, verbose, …)
    │       │       ├─► command routing  (/reset, /status, /compact, …)
    │       │       └─► agent runner → LLM response
    │       │
    │       └─► routeReply()           (src/auto-reply/reply/route-reply.ts)
    │               │
    │               └─► deliverOutboundPayloads()  (src/infra/outbound/deliver.ts)
    │                       │
    │                       └─► ChannelOutboundAdapter.sendText/sendMedia/sendPoll
    │
    └─► markDispatchIdle() / onSettled()
```

### Outbound Flow

```
routeReply(payload, channel, to, accountId, threadId)
    │
    ├─ normalizeReplyPayload()        apply responsePrefix, strip empty
    ├─ normalizeChannelId(channel)    validate channel is registered
    │
    └─► deliverOutboundPayloads()
            │
            ├─ loadChannelOutboundAdapter(channelId)   lazy load from plugin registry
            ├─ normalizeReplyPayloadsForDelivery()      chunk text, resolve media
            │
            ├─ sendPayload() / sendText() / sendMedia() / sendPoll()
            │   [delegates to channel's ChannelOutboundAdapter]
            │
            └─ appendAssistantMessageToSessionTranscript()   mirror to session log
```

---

## Session Key Format Per Channel

Session keys are the persistence identifier for a conversation thread. They are built by `buildAgentPeerSessionKey()` in `src/routing/session-key.ts`.

### Format grammar

```
agent:<agentId>:<rest>
```

| Scope | Key format | Example |
|-------|-----------|---------|
| Main / DM (default) | `agent:<agentId>:main` | `agent:main:main` |
| DM per-peer | `agent:<agentId>:direct:<peerId>` | `agent:main:direct:12345678` |
| DM per-channel-peer | `agent:<agentId>:<channel>:direct:<peerId>` | `agent:main:telegram:direct:12345678` |
| DM per-account-channel-peer | `agent:<agentId>:<channel>:<accountId>:direct:<peerId>` | `agent:main:telegram:default:direct:12345678` |
| Group / channel | `agent:<agentId>:<channel>:<kind>:<groupId>` | `agent:main:discord:channel:987654321` |
| Thread (appended) | `<baseKey>:thread:<threadId>` | `agent:main:telegram:group:123:thread:456` |

- `agentId`: normalized lowercase, `[a-z0-9_-]{1,64}` (default: `"main"`)
- `channel`: lowercase channel id (`telegram`, `whatsapp`, `discord`, …)
- `accountId`: normalized account id (default: `"default"`)
- `peerKind`: `"direct"` | `"group"` | `"channel"`
- `peerId`: lowercased provider-specific ID (chat ID, JID, channel ID)
- `threadId`: lowercased thread/topic ID

**DM scope** is configured per-agent (`session.dmScope` config key) and determines how many distinct session histories DM senders get.

**Identity links** (`identityLinks` config) let multiple platform IDs map to the same canonical peer ID, merging DM sessions across channels.

---

## Group vs DM Handling

### ChatType taxonomy

```
ChatType = "direct" | "group" | "channel" | "thread"
```

| ChatType | Description |
|----------|-------------|
| `direct` | 1:1 private message |
| `group` | group chat / WhatsApp group / Signal group |
| `channel` | broadcast channel (Telegram channel, Discord text channel) |
| `thread` | reply thread within group/channel (Telegram topics, Slack threads) |

### Group activation modes

Groups have two activation modes controlled by `requireMention`:

| Mode | Trigger |
|------|---------|
| `mention` (default) | Agent only responds when explicitly mentioned (`@BotName`) |
| `always` | Agent responds to every message (silent token `[silent]` used to suppress) |

Resolution priority (per channel):
1. `channels.<channel>.groups.<groupId>.requireMention` (explicit group config)
2. `channels.<channel>.groupPolicy` (`"allowlist"` | `"open"`)
3. Channel defaults (most channels default to `mention`)

### Group session isolation

Groups use a separate session from DMs:
- Group sessions use `agent:<agentId>:<channel>:group:<groupId>` or `channel:<channelId>`
- Each group gets independent conversation history
- The `buildGroupChatContext()` injects persistent context (group name, participants) into every system prompt turn

### Group Tool Policy

The `ChannelGroupAdapter.resolveToolPolicy()` method returns a `GroupToolPolicyConfig` that restricts or grants tool access per group:
- `tools`: list of allowed tool names
- `toolsBySender`: per-sender tool overrides
- `restricted`: blanket restriction flag

---

## Channel-Specific Tool Policies

Tool policies are resolved through a chain:

```
1. Agent-level default tools (from agent config)
2. Channel dock  → ChannelGroupAdapter.resolveToolPolicy(groupContext)
3. Group config  → channels.<channel>.groups.<id>.tools / toolsBySender
4. Per-sender    → toolsBySender[senderId/senderName/senderUsername]
```

Each channel implements `resolveToolPolicy` differently:

| Channel | Tool policy source |
|---------|-------------------|
| Telegram | `channels.telegram.groups.<id>.tools` |
| WhatsApp | `channels.whatsapp.groups.<jid>.tools` |
| Discord | `channels.discord.guilds.<guildId>.channels.<channelId>.tools` |
| Slack | `channels.slack.channels.<channelId>.tools` |
| iMessage | `channels.imessage.groups.<groupId>.tools` |
| IRC | `channels.irc.channels.<channel>.tools` (case-insensitive) |
| Google Chat | `channels.googlechat.spaces.<spaceId>.tools` |
| Signal | per-group via shared `resolveChannelGroupToolsPolicy()` |

Channel-owned agent tools (e.g., WhatsApp login flow) are declared via `agentTools` on `ChannelPlugin` and injected by the agent runner.

### Message action names (channel tool operations)

The `ChannelMessageActionAdapter.handleAction()` dispatches named operations:

```
send, broadcast, poll, react, reactions, read,
edit, unsend, reply, sendWithEffect,
renameGroup, setGroupIcon, addParticipant, removeParticipant, leaveGroup,
sendAttachment, delete, pin, unpin, list-pins, permissions,
thread-create, thread-list, thread-reply,
search, sticker, sticker-search,
member-info, role-info, emoji-list, emoji-upload, sticker-upload,
role-add, role-remove, channel-info, channel-list,
channel-create, channel-edit, channel-delete, channel-move,
category-create, category-edit, category-delete,
voice-status, event-list, event-create,
timeout, kick, ban, set-presence
```

Not all channels implement all actions. `listActions()` returns the supported subset.

---

## Reply Dispatching and Formatting

### Reply dispatcher

`ReplyDispatcher` (src/auto-reply/reply/reply-dispatcher.ts) is a concurrency controller that:
- Queues overlapping inbound messages (debounce/sequential)
- Tracks "in-flight" vs "idle" state for typing indicators
- Exposes `markComplete()` / `waitForIdle()` lifecycle hooks

The `createReplyDispatcherWithTyping()` variant wraps the dispatcher with typing indicator side-effects wired to the channel's `ChannelMessagingAdapter`.

### Text chunking

Each channel declares:
- `outbound.textChunkLimit`: max characters per message chunk
- `outbound.chunker`: custom chunker function (Telegram uses markdown-aware chunking)
- `outbound.chunkerMode`: `"text"` | `"markdown"`

Default chunk limits per channel:

| Channel | Chunk limit |
|---------|------------|
| Discord | 2,000 chars |
| IRC | 350 chars |
| Telegram | 4,000 chars |
| WhatsApp | 4,000 chars |
| Slack | 4,000 chars |
| Signal | 4,000 chars |
| Google Chat | 4,000 chars |

Telegram uses a markdown-aware chunker that breaks at paragraph boundaries to preserve formatting. IRC uses block-streaming coalescing (300 chars / 1s idle) to avoid flood.

### Mention stripping

Before text reaches the agent, mentions are stripped via `ChannelMentionAdapter.stripPatterns()`:

| Channel | Strip pattern |
|---------|--------------|
| Discord | `<@!?\\d+>` |
| Slack | `<@[^>]+>` |
| WhatsApp | `@<self_e164>` |

### Reply threading

`ChannelThreadingAdapter.resolveReplyToMode()` controls whether the bot threads replies:

| Mode | Behavior |
|------|----------|
| `"off"` | Replies are not threaded (default for most channels) |
| `"first"` | Reply-to is set only on the first turn of a session |
| `"all"` | Every reply is threaded back to the triggering message |

Channels that support explicit reply tags can override `off` mode with `allowExplicitReplyTagsWhenOff: true` (Slack uses this).

---

## How to Add a New Channel

### Step 1: Create the extension package

```
extensions/<channel-id>/
├── index.ts                 # Plugin entrypoint
├── openclaw.plugin.json     # Manifest
├── package.json
└── src/
    ├── channel.ts           # ChannelPlugin implementation
    └── runtime.ts           # PluginRuntime accessor
```

### Step 2: Write the manifest

The `openclaw.plugin.json` manifest declares the plugin `id`, `channels` array (listing the channel IDs it provides), and a `configSchema` object for channel-specific config validation.

### Step 3: Implement `ChannelPlugin`

The minimum required fields on a `ChannelPlugin` are:

- **`id`** — unique channel identifier
- **`meta`** — channel metadata: id, label, selectionLabel, docsPath, blurb
- **`capabilities`** — supported chat types (direct, group, etc.) and media support flag
- **`config`** — adapter with `listAccountIds`, `resolveAccount`, `isConfigured`, `describeAccount`
- **`outbound`** — delivery config: `deliveryMode` (direct/gateway/hybrid), `textChunkLimit`, and `sendText` method
- **`gateway`** — adapter with `startAccount` to start the channel monitor/listener

All other adapters (security, groups, mentions, threading, actions, heartbeat, directory, etc.) are optional and provide progressively richer integration.

### Step 4: Write the plugin entrypoint

The `index.ts` entrypoint exports a plugin definition with `id`, `name`, `description`, `configSchema`, and a `register(api)` function that stores the runtime reference and calls `api.registerChannel({ plugin: myPlugin })`.

### Step 5: Register in the channel registry (core channels only)

For external/third-party channels this step is skipped — the plugin registry picks them up automatically via `discoverOpenClawPlugins()`.

For **core bundled channels** (telegram, whatsapp, discord, etc.), add to:
- `CHAT_CHANNEL_ORDER` array
- `CHAT_CHANNEL_META` record
- `DOCKS` record in `src/channels/dock.ts`

### Step 6: Add a ChannelDock entry (for core channels)

In `src/channels/dock.ts`, add to the `DOCKS` record with: `id`, `capabilities`, `outbound` (textChunkLimit), `config` (resolveAllowFrom, formatAllowFrom), and `groups` (resolveRequireMention, resolveToolPolicy).

### Step 7: Wire up inbound events

Inside `gateway.startAccount()`, start a monitor that normalizes platform events into `MsgContext` objects (with Body, From, To, SessionKey, AccountId, ChatType, Provider fields) and calls `dispatchInboundMessage()`.

---

## Core Files Reference

| File | Purpose |
|------|---------|
| `src/channels/registry.ts` | Channel ID registry, ordering, aliases |
| `src/channels/dock.ts` | Lightweight channel behavior for shared code (no monitors) |
| `src/channels/plugins/types.ts` | All channel adapter type exports |
| `src/channels/plugins/types.core.ts` | Core types: ChannelId, ChannelMeta, ChannelCapabilities, … |
| `src/channels/plugins/types.adapters.ts` | Adapter interfaces: Config, Outbound, Gateway, Security, … |
| `src/channels/plugins/types.plugin.ts` | ChannelPlugin aggregate type |
| `src/channels/plugins/index.ts` | Runtime plugin lookup: `listChannelPlugins()`, `getChannelPlugin()` |
| `src/channels/plugins/load.ts` | Lazy cached plugin loader |
| `src/channels/plugins/catalog.ts` | Plugin discovery for install/UI catalogs |
| `src/channels/plugins/message-action-names.ts` | Enum of all supported message action names |
| `src/channels/session.ts` | `recordInboundSession()` — session state side-effects |
| `src/routing/session-key.ts` | `buildAgentPeerSessionKey()`, `buildGroupHistoryKey()`, etc. |
| `src/auto-reply/dispatch.ts` | Top-level `dispatchInboundMessage()` entry point |
| `src/auto-reply/reply/dispatch-from-config.ts` | Session init, agent invocation, reply routing |
| `src/auto-reply/reply/route-reply.ts` | `routeReply()` — channel-agnostic reply sender |
| `src/auto-reply/reply/groups.ts` | Group mention resolution, group context/intro builders |
| `src/auto-reply/templating.ts` | `MsgContext` type definition |
| `src/infra/outbound/deliver.ts` | `deliverOutboundPayloads()` — actual send with chunking |
| `extensions/<channel>/index.ts` | Plugin entrypoint (calls `api.registerChannel()`) |
| `extensions/<channel>/src/channel.ts` | `ChannelPlugin` implementation |
| `extensions/<channel>/src/runtime.ts` | `PluginRuntime` module-scoped accessor |
