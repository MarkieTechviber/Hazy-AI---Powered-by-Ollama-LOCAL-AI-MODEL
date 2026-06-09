# Hermes Agent 2026.6.5 — Source Code Study and Application Logic Breakdown

> Prepared as an original source-code study from the uploaded archive `hermes-agent-2026.6.5.zip`.
>
> This document explains the application in plain English. It references file paths, module names, function names, route names, and class names only for study purposes. It does **not** copy or rewrite the source code.

---

## 0. Study Scope and Reading Notes

The uploaded project is a large multi-surface AI agent system. The source tree contains about **5,500+ files** and roughly **105 MB** of extracted content, including the Python agent runtime, terminal UI, web dashboard, desktop shell, messaging gateway, skills, plugins, tests, docs, packaging, and optional integrations.

This study focuses on the application logic that controls how the system actually works:

- agent startup and conversation execution
- model/provider routing
- tool discovery and tool execution
- terminal/file/browser/web/vision/memory/skill features
- messaging gateway sessions
- cron/scheduled automations
- dashboard API and UI
- terminal UI / desktop UI communication
- local storage, configuration, sessions, and memory
- security, permissions, risks, limitations, and improvement ideas

Because the project is very large, this is a **system-level reverse-engineering document**, not a line-by-line commentary on every test, asset, localization file, or generated resource. The important runtime modules and application architecture are covered carefully.

---

# 1. Application Overview

## 1.1 What This Application Is For

Hermes Agent is a **local-first, tool-using AI agent platform**. Its main purpose is to let a user interact with a large language model that can also use tools, manage memory, browse or search the web, run terminal commands, edit files, automate tasks, respond through messaging platforms, and operate through different user interfaces.

In simple terms, it is not just a chat app. It is closer to a full **agent operating environment**. A user sends a request, the agent decides what context it needs, chooses tools, performs actions, stores or retrieves memory, and then gives a final answer.

## 1.2 What Problem It Solves

The application tries to solve several connected problems:

| Problem | How Hermes Tries to Solve It |
|---|---|
| AI chat normally cannot act on local files or systems | Hermes provides terminal, file, code, browser, and automation tools. |
| Long-running agent sessions are hard to resume | Hermes stores sessions, messages, tool calls, metadata, summaries, and searchable history in SQLite. |
| Different model providers have different APIs | Hermes wraps provider selection, fallback providers, prompt formatting, tool schemas, streaming, and retries behind a unified agent loop. |
| Agents forget user preferences | Hermes has built-in memory files and optional external memory provider plugins. |
| Agent tools can become risky or too broad | Hermes uses toolsets, platform restrictions, approval hooks, plugin checks, guardrails, and configuration settings. |
| Users want to access the agent outside a terminal | Hermes supports a terminal UI, a web dashboard, a desktop shell, and messaging platforms. |
| Automation needs scheduling | Hermes has a cron-style scheduled job system. |
| Advanced agent workflows need delegation | Hermes includes subagents, mixture-of-agents behavior, task management, and kanban-style coordination. |

## 1.3 Who the Users Are

The likely users are:

- developers who want an AI coding or automation assistant
- researchers testing agent behavior, tool use, and self-improvement workflows
- power users who want a local AI control center
- teams or communities that want an agent reachable through chat platforms
- users who want scheduled AI tasks, memory, and multi-provider model routing

## 1.4 Main Features

The main features are:

- interactive AI agent conversation
- terminal and command execution
- local file reading, writing, patching, and searching
- web search and extraction
- browser automation
- image/vision/audio tools depending on configuration
- model provider switching and fallback chains
- session storage and searchable history
- memory storage and optional memory providers
- skills and optional skills hub
- subagent delegation and mixture-of-agents flows
- scheduled cron jobs
- messaging gateway for platforms like Telegram, Discord, Slack, WhatsApp, Signal, Matrix, and others
- web dashboard for configuration, sessions, logs, cron, skills, plugins, models, and system status
- terminal UI and desktop shell
- plugin system for providers, platforms, tools, memory, search, observability, and UI extensions
- ACP/editor integration for agent-client protocol workflows
- tests, packaging, installers, Docker/Nix support, and update commands

## 1.5 What Kind of System It Is

Hermes is a **multi-interface local agent platform**:

| Layer | Type |
|---|---|
| Core agent | Python application / local agent runtime |
| CLI | Python command-line application |
| TUI | React/Ink terminal UI connected to a Python JSON-RPC backend |
| Web dashboard | FastAPI backend plus React/Vite frontend |
| Desktop shell | Electron desktop app wrapping Hermes behavior |
| Installer | Tauri-based bootstrap installer app |
| Messaging gateway | Python service that connects external chat platforms to agent sessions |
| Database | Local SQLite session database plus local JSON/YAML/Markdown state files |
| Plugins | Python plugin architecture and web dashboard plugin support |

The system is mostly local, but it can call many external services depending on enabled providers and integrations.

---

# 2. Project Structure Explanation

## 2.1 Top-Level Source Tree

The project root contains these important areas:

| Path | Purpose |
|---|---|
| `run_agent.py` | Compatibility wrapper and central `AIAgent` class entry point. |
| `agent/` | Core agent initialization, conversation loop, context, memory, compression, streaming, runtime state, and provider-facing logic. |
| `model_tools.py` | Bridges LLM tool calls to registered Python tools. |
| `tools/` | Built-in tools: terminal, files, browser, web search, memory, skills, todo, cron, messaging, vision, image generation, etc. |
| `toolsets.py` | Groups tools into named capability sets and aliases. |
| `tools/registry.py` | Central tool registry that discovers, registers, filters, and dispatches tools. |
| `hermes_cli/` | Main command-line application, config management, dashboard server, profiles, secrets, setup, status, skills, plugins, and operational commands. |
| `hermes_state.py` | SQLite-backed session/message database and search system. |
| `gateway/` | Messaging gateway service and platform adapters. |
| `cron/` | Scheduled task storage and scheduler execution. |
| `web/` | React/Vite dashboard frontend. |
| `ui-tui/` | React/Ink terminal UI frontend. |
| `tui_gateway/` | Python JSON-RPC backend for the TUI. |
| `apps/desktop/` | Electron desktop shell. |
| `apps/bootstrap-installer/` | Tauri bootstrap installer UI. |
| `apps/shared/` | Shared TypeScript package for desktop-related apps. |
| `plugins/` | Bundled plugin implementations. |
| `providers/` | Provider base abstractions. |
| `skills/` | Built-in skills loaded by the skills system. |
| `optional-skills/` | Extra skills that can be installed or enabled. |
| `optional-mcps/` | Optional MCP server definitions/integrations. |
| `acp_adapter/` | Agent Client Protocol server/adapter and edit approval support. |
| `tests/` | Large test suite covering agent, tools, gateway, CLI, cron, plugins, state, desktop, and security behavior. |
| `docs/`, `website/` | Documentation and website source. |
| `docker/`, `nix/`, `packaging/`, `scripts/` | Deployment, packaging, setup, update, and helper scripts. |

## 2.2 Core Runtime Files

| File | Responsibility |
|---|---|
| `run_agent.py` | Exposes `AIAgent`, wires environment loading, initializes sessions, forwards conversation execution, maintains backward compatibility for older imports. |
| `agent/agent_init.py` | Builds the full agent object: provider settings, tools, memory, compression, session DB, callbacks, runtime flags, browser/terminal state, and fallback behavior. |
| `agent/conversation_loop.py` | Main loop that sends messages to the model, receives tool calls, executes tools, manages retries, handles streaming, compresses context, and returns final responses. |
| `model_tools.py` | Converts model tool-call requests into actual registered tool execution and applies schema coercion, bridge tool behavior, plugin hooks, and approval checks. |
| `toolsets.py` | Defines what named capability groups mean, such as core Hermes CLI tools, browser tools, file tools, memory tools, cron tools, and webhook-safe tools. |
| `tools/registry.py` | Stores tool metadata and handlers; filters tools by enabled toolsets; dispatches calls safely through one registry. |

These files are tightly connected. The usual chain is:

1. `hermes_cli/main.py` or another interface creates an agent through `run_agent.py`.
2. `run_agent.py` delegates setup to `agent/agent_init.py`.
3. `agent/agent_init.py` loads tool definitions through `model_tools.py` and `tools/registry.py`.
4. `agent/conversation_loop.py` runs the model/tool loop.
5. When the model requests a tool, `model_tools.py` dispatches it through `tools/registry.py`.
6. Results return to `agent/conversation_loop.py`, which either continues tool use or produces a final answer.

## 2.3 CLI and Configuration Files

| File / Folder | Responsibility |
|---|---|
| `hermes_cli/main.py` | Main CLI parser and command dispatcher. It exposes commands for chat, gateway, cron, skills, plugins, config, sessions, memory, setup, status, dashboard, etc. |
| `hermes_cli/config.py` | Loads, validates, merges, migrates, and writes `~/.hermes/config.yaml` and environment settings. |
| `hermes_cli/env_loader.py` | Loads Hermes environment variables and `.env` values. |
| `hermes_cli/web_server.py` | FastAPI dashboard backend. |
| `hermes_cli/plugins.py` | Discovers and loads plugins from bundled, user, project, and package entry point locations. |
| `hermes_cli/profiles.py` and profile-related files | Manage named agent profiles and persona/model/tool configurations. |
| `hermes_cli/secrets.py`, credential-related modules | Manage provider credentials and secret sources. |

The CLI is the control center. Many dashboard and gateway features eventually call the same lower-level modules that the CLI uses.

## 2.4 Tool Files

The `tools/` folder contains the built-in capabilities that the AI agent can invoke. Important groups include:

| Tool Area | Example Files | Purpose |
|---|---|---|
| Terminal / process | `terminal_tool.py`, `process_registry.py`, `environments/` | Run shell commands, manage process sessions, support local/Docker/SSH/Singularity/Modal/Daytona-like backends depending on config. |
| File operations | `file_tools.py`, `file_operations.py`, `patch_parser.py`, `path_security.py`, `file_safety.py` | Read, write, patch, search, inspect, and protect local files. |
| Browser | `browser_tool.py`, `browser_cdp_tool.py`, `browser_dialog_tool.py`, `browser_camofox.py` | Browser automation through browser backends. |
| Web | `web_tools.py`, `x_search_tool.py`, `url_safety.py` | Search and extract information from the web, with safety checks. |
| Vision/media | `vision_tools.py`, `image_generation_tool.py`, `video_generation_tool.py`, `transcription_tools.py`, `tts_tool.py` | Analyze images, generate media, transcribe or speak audio when configured. |
| Memory/skills | `memory_tool.py`, `skills_tool.py`, `skill_manager_tool.py`, `skills_hub.py`, `skill_usage.py`, `skills_guard.py` | Store memories, load reusable skills, install or manage skills. |
| Orchestration | `delegate_tool.py`, `mixture_of_agents_tool.py`, `todo_tool.py`, `kanban_tools.py`, `cronjob_tools.py`, `clarify_tool.py` | Delegate tasks, manage todo lists, schedule work, ask clarifying questions, coordinate task boards. |
| Integrations | `send_message_tool.py`, `homeassistant_tool.py`, `discord_tool.py`, `microsoft_graph/` | Communicate with external platforms and services. |
| Security | `tirith_security.py`, `threat_patterns.py`, `osv_check.py`, `url_safety.py` | Scan risky prompts, dependencies, URLs, and tool outputs. |

## 2.5 Gateway Files

| File / Folder | Responsibility |
|---|---|
| `gateway/run.py` | Main messaging gateway runner. Starts platform adapters, manages active agent sessions, queues work, handles restarts and shutdowns. |
| `gateway/session.py` | Builds stable session keys for DMs, groups, channels, and threads. Stores session mappings and platform context. |
| `gateway/platforms/base.py` | Shared adapter interface for messaging platforms. Defines sending, typing, media, draft, and clarify behavior. |
| `gateway/platforms/*` | Platform-specific adapters such as Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, webhooks, SMS, Feishu, DingTalk, WeCom, Weixin, BlueBubbles, Home Assistant, QQBot, Yuanbao, and plugin platforms. |

The gateway lets Hermes act like a bot connected to real messaging services. Each chat maps to a Hermes session so conversations can continue across messages.

## 2.6 Web Dashboard Files

| File / Folder | Responsibility |
|---|---|
| `hermes_cli/web_server.py` | FastAPI backend for dashboard API routes, websockets, configuration, sessions, logs, cron jobs, plugins, skills, models, gateway operations, and more. |
| `web/src/App.tsx` | Main React app shell and routing. |
| `web/src/pages/*` | Dashboard pages such as Chat, Sessions, Config, Cron, Skills, Models, Plugins, Logs, System, Webhooks, Profiles, Channels, MCP, Analytics. |
| `web/src/components/*` | Reusable UI widgets: model picker, schedule builder, markdown renderer, tool call display, sidebar, theme switcher, auth widget, dialogs. |
| `web/src/lib/api.ts` | Client-side API helper for calling the FastAPI backend. |
| `web/src/lib/gatewayClient.ts` | Client-side gateway/chat connection logic. |
| `web/src/plugins/*` | Dashboard plugin registry and extension slots. |

## 2.7 TUI and Desktop Files

| Path | Responsibility |
|---|---|
| `tui_gateway/server.py` | Python JSON-RPC backend for the terminal UI. It protects stdout for protocol messages and sends logs/errors elsewhere. |
| `ui-tui/src/` | React/Ink terminal UI. Handles chat history, input, slash commands, overlays, streaming markdown, model picker, active sessions, todo panel, and voice UI. |
| `ui-tui/src/gatewayClient.ts` | Spawns/connects to the TUI gateway, handles JSON-RPC, startup timeouts, events, and WebSocket sidecar. |
| `apps/desktop/` | Electron desktop app. Packages Hermes into a native desktop shell with renderer UI, Electron main process, native dependency staging, and distribution settings. |
| `apps/bootstrap-installer/` | Tauri installer that drives setup scripts with a polished UI. |

## 2.8 Plugin Files

| File / Folder | Responsibility |
|---|---|
| `hermes_cli/plugins.py` | Plugin discovery and registration framework. |
| `plugins/` | Bundled plugins for providers, browser backends, memory providers, platform adapters, web search providers, observability, dashboard auth, media generation, and other extensions. |
| Plugin `plugin.yaml` files | Describe plugin metadata, kind, entry point, dependencies, and capability type. |
| Plugin `register(ctx)` functions | Let plugins add hooks, tools, platforms, memory providers, model providers, routes, or transformations. |

Plugins can extend behavior at many points, including before/after tool calls, before/after model calls, session lifecycle, gateway dispatch, and approval workflows.

## 2.9 Database and Local State Files

The application stores local state mainly under the Hermes home directory, usually `~/.hermes`.

| State Area | Typical Location | Purpose |
|---|---|---|
| Main config | `~/.hermes/config.yaml` | Main YAML configuration. |
| Environment/secrets | `~/.hermes/.env` and configured secret sources | Provider keys and environment settings. |
| Session DB | `~/.hermes/state.db` | SQLite sessions, messages, metadata, token/cost stats, search indexes. |
| Memory | `~/.hermes/memories/MEMORY.md`, `~/.hermes/memories/USER.md` | Built-in memory files. |
| Cron jobs | `~/.hermes/cron/jobs.json` | Scheduled job definitions. |
| Cron output | `~/.hermes/cron/output/...` | Saved results from scheduled jobs. |
| Logs | `~/.hermes/logs/...` | CLI, gateway, TUI, and diagnostic logs. |
| Plugins/skills | `~/.hermes/plugins`, skill directories | User-installed extensions. |

---

# 3. Application Flow

## 3.1 What Happens When the App Starts

The exact startup path depends on which interface is used.

### CLI Startup

1. The executable script `hermes` points to `hermes_cli.main:main`.
2. `hermes_cli/main.py` parses command-line arguments.
3. It loads configuration from `hermes_cli/config.py`.
4. It loads environment variables and provider keys.
5. Depending on the command, it may:
   - start an interactive agent session,
   - launch the TUI,
   - start the web dashboard,
   - run gateway service commands,
   - manage cron jobs,
   - manage skills/plugins/config/sessions,
   - run setup/status/doctor/security commands.
6. For a chat session, the CLI creates an `AIAgent` through `run_agent.py`.
7. `run_agent.py` calls `agent/agent_init.py` to fully prepare the agent.
8. The user message is passed into `agent/conversation_loop.py`.

### Web Dashboard Startup

1. A CLI or desktop command starts the FastAPI server in `hermes_cli/web_server.py`.
2. The React/Vite frontend in `web/` loads in the browser.
3. The frontend calls `/api/status`, `/api/config`, `/api/sessions`, `/api/model/options`, and other API routes to populate the dashboard.
4. Chat-related UI connects through API routes and WebSockets.
5. Server-side routes eventually call the same agent, config, session, gateway, cron, and plugin modules used by the CLI.

### TUI Startup

1. The TUI frontend in `ui-tui/` starts.
2. It spawns or connects to `tui_gateway/server.py`.
3. The gateway communicates using JSON-RPC.
4. The TUI sends user input to the gateway.
5. The gateway creates or resumes an agent session and streams events back to the TUI.

### Messaging Gateway Startup

1. `gateway/run.py` starts the gateway runner.
2. The runner loads platform configurations and adapters.
3. Each enabled platform adapter connects to its service.
4. Incoming messages are converted into a normalized `SessionSource`.
5. `gateway/session.py` maps that source to a stable Hermes session.
6. The gateway passes the message into an agent instance and sends the response back to the platform.

### Desktop Startup

1. The Electron app in `apps/desktop/` starts its main process.
2. It loads the renderer app and checks backend connectivity.
3. It can use the same local Hermes backend services behind the scenes.
4. The desktop app packages this experience as a native app.

## 3.2 Main User Flow Step by Step

A normal chat request follows this path:

1. **User sends a message** from CLI, TUI, dashboard, desktop, or a messaging platform.
2. **Interface normalizes the message** into the format expected by the agent.
3. **Session is created or resumed** using `hermes_state.py` and/or gateway session mapping.
4. **Agent is initialized** with model, provider, tools, memory, compression settings, and callbacks.
5. **Conversation loop starts** in `agent/conversation_loop.py`.
6. **System prompt is built or reused** from configuration, memory, skills, context, and profile settings.
7. **Messages are prepared** for the chosen provider, including provider-specific cleanup.
8. **Model is called** with conversation messages and allowed tool schemas.
9. The model either returns:
   - a final answer, or
   - one or more tool calls.
10. **Tool calls are validated** by name and argument schema.
11. **Tool calls are dispatched** through `model_tools.py` and `tools/registry.py`.
12. **Tool results are added** back to the conversation.
13. The loop repeats until the model gives a final response or a safety/budget/iteration limit is reached.
14. **Final answer is cleaned** of internal-only thinking or memory-context artifacts.
15. **Messages and metadata are saved** to SQLite.
16. **Callbacks/plugins run** for post-processing, logging, memory sync, and session finalization.
17. **The response is returned** to the original interface.

## 3.3 Data Movement Through the Application

The main data flow is:

```text
User Interface
  -> normalized message
  -> agent session
  -> memory/context/system prompt assembly
  -> model provider request
  -> model response
  -> optional tool calls
  -> tool registry dispatch
  -> tool results
  -> model follow-up
  -> final answer
  -> session database and UI output
```

Important data objects moving through the system include:

| Data | Where It Comes From | Where It Goes |
|---|---|---|
| User message | CLI/TUI/web/desktop/gateway | Conversation loop, session DB |
| System prompt | Config, profile, skills, memory, platform context | Model request |
| Tool definitions | `toolsets.py`, `tools/registry.py`, plugins | Model request |
| Tool call | Model provider response | `model_tools.py` |
| Tool result | Built-in tool or plugin tool | Conversation messages, model follow-up |
| Final response | Model provider | UI, gateway platform, session DB |
| Session metadata | Runtime and token tracking | SQLite state DB |
| Memory entries | Memory tool or external memory provider | System prompt / context injection |
| Cron output | Scheduled agent run | Local cron output files, optional delivery platform |

## 3.4 Frontend, Backend, Database, API, and Local Service Communication

### Web Dashboard

The dashboard is a browser frontend plus FastAPI backend.

```text
React dashboard
  -> HTTP API / WebSocket
  -> hermes_cli/web_server.py
  -> config/session/agent/gateway/cron/plugin modules
  -> local files + SQLite + external providers when needed
```

The dashboard is mainly a control surface. It does not independently implement agent intelligence; it calls backend modules.

### TUI

The TUI separates the terminal user interface from the Python agent process.

```text
React/Ink TUI
  -> JSON-RPC / events
  -> tui_gateway/server.py
  -> AIAgent + sessions + tools
  -> streamed updates back to TUI
```

The TUI gateway carefully keeps stdout reserved for protocol messages. Logs and crashes go to stderr or log files so the JSON-RPC protocol is not corrupted.

### Messaging Gateway

The gateway maps external chats to local Hermes sessions.

```text
Telegram/Discord/Slack/etc.
  -> platform adapter
  -> gateway/run.py
  -> gateway/session.py
  -> AIAgent
  -> response
  -> platform adapter sends message back
```

### Database

The central database is SQLite through `hermes_state.py`. It stores sessions, messages, tool metadata, token counts, costs, full-text indexes, compression locks, and platform topic mappings.

## 3.5 Important Decision Points

| Decision | Where It Happens | Meaning |
|---|---|---|
| Which model/provider to use | `agent/agent_init.py`, config, CLI/profile settings | Selects provider API mode, fallback chain, routing behavior. |
| Which tools are allowed | `toolsets.py`, `model_tools.py`, `tools/registry.py`, config | Controls the model's available capabilities. |
| Whether a tool call is valid | `agent/conversation_loop.py`, `model_tools.py` | Invalid names/arguments are rejected or corrected. |
| Whether to continue tool loop | `agent/conversation_loop.py` | Continues until final answer, max iteration, budget, or failure. |
| Whether to compress context | conversation loop + compression modules | Trims/summarizes history when token limits approach. |
| Whether to use fallback provider | provider call/retry logic | Switches provider/model when errors occur and fallback is configured. |
| Whether gateway message shares session | `gateway/session.py` | DMs, groups, and threads get different session-key logic. |
| Whether cron job should run | `cron/scheduler.py` and `cron/jobs.py` | Checks schedule, locks, state, and job status. |
| Whether plugin can block/modify action | `hermes_cli/plugins.py`, hooks | Plugins may transform or block model/tool/session behavior. |
| Whether file mutation requires approval | ACP/edit approval and tool hooks | Prevents unauthorized edits in certain client modes. |

---

# 4. Feature-by-Feature Logic

## 4.1 Agent Conversation Engine

### What It Does

The conversation engine is the heart of Hermes. It takes a user message, calls a model, handles tool calls, executes tools, and returns a final answer.

### Controlled By

- `run_agent.py`
- `agent/agent_init.py`
- `agent/conversation_loop.py`
- `model_tools.py`
- `tools/registry.py`
- `hermes_state.py`

### Data It Uses

- user message
- conversation history
- system prompt
- enabled tool definitions
- model/provider settings
- memory/context blocks
- session ID and message records
- token/cost counters
- streaming callbacks

### Step-by-Step Logic

1. Create or resume a session.
2. Build an agent object with provider settings and tool definitions.
3. Prepare the message list.
4. Add memory, skills, profile instructions, platform context, and system prompt.
5. Clean and normalize messages for provider compatibility.
6. Call the selected model provider.
7. If the model returns a final text answer, clean it and finish.
8. If the model returns tool calls, validate them.
9. Execute each tool call through the registry.
10. Add tool results back into messages.
11. Call the model again with the new tool results.
12. Repeat until completion or a configured limit is reached.
13. Save messages, metadata, token usage, and cost estimates.
14. Return the final response to the interface.

### Conditions and Rules

- Tool names must exist in the valid tool list.
- Tool arguments must match expected schemas as much as possible.
- The loop has maximum iteration and budget limits.
- Context may be compressed if it becomes too large.
- Internal thinking or memory-only tags are stripped from visible output.
- Plugin hooks may transform requests, responses, or tool results.
- Provider fallback may activate after selected API errors.

### Output

The result is a structured response containing the final answer, message history, API-call count, token usage, cost metadata, reasoning metadata if available, and session ID.

### Errors and Edge Cases

- provider authentication or billing failure
- rate limit errors
- context length errors
- invalid tool name
- invalid tool arguments
- tool runtime exception
- empty model response
- provider-specific message format issues
- Unicode/surrogate character issues
- max iteration exhausted
- stale browser or terminal resources
- failed file mutations detected after a turn

## 4.2 Model Provider and Fallback System

### What It Does

Hermes supports multiple model providers and API modes. It can select provider behavior, format requests, stream outputs, and fall back to backup providers when configured.

### Controlled By

- `agent/agent_init.py`
- provider plugins in `plugins/`
- `providers/base.py`
- `hermes_cli/config.py`
- model-related CLI/dashboard routes

### Data It Uses

- configured model name
- provider base URL
- API mode
- API keys or credential pool
- fallback provider chain
- prompt caching settings
- routing rules
- provider plugin metadata

### Step-by-Step Logic

1. Load selected model/provider from config, CLI args, profile, or runtime override.
2. Detect special provider modes when needed, such as Anthropic-compatible endpoints, Bedrock, Azure-like behavior, or Codex-style responses.
3. Build provider-specific request parameters.
4. Convert messages and tool schemas into the provider's expected shape.
5. Call the provider.
6. Stream or collect response chunks.
7. If a recoverable provider error happens, check retry and fallback rules.
8. If fallback is available, switch to the next provider/model and retry.
9. Restore the primary runtime state when appropriate.
10. Track token usage and estimated cost.

### Conditions and Rules

- Fallback is not arbitrary; it follows configured fallback providers.
- Prompt caching is provider-sensitive.
- Tool schema formatting may differ by provider.
- Some providers support reasoning content while others require it to be stripped or normalized.
- Some provider-specific options must be disabled or changed depending on mode.

### Output

The provider layer outputs assistant messages, tool calls, reasoning metadata, usage stats, and streaming events.

### Errors and Edge Cases

- invalid API key
- unsupported model
- provider rate limit
- provider downtime
- streaming interruptions
- invalid encrypted content
- provider rejects tool schema
- context length exceeded
- provider returns empty content
- fallback chain exhausted

## 4.3 Tool Registry and Tool Execution

### What It Does

The tool system is how the model can perform actions. Tools are registered with metadata, schemas, handlers, toolset names, and optional availability checks.

### Controlled By

- `tools/registry.py`
- `model_tools.py`
- `toolsets.py`
- individual `tools/*.py` modules
- plugin tools

### Data It Uses

- enabled and disabled toolsets
- tool definitions
- model tool-call name and arguments
- schema definitions
- runtime context
- plugin hooks
- tool result objects

### Step-by-Step Logic

1. Built-in tool modules register their tools with the central registry.
2. Plugins may register additional tools.
3. The agent asks for tool definitions based on enabled toolsets.
4. The registry filters tools by toolset, availability checks, and dynamic schemas.
5. The model sees only the allowed tool schemas.
6. When the model calls a tool, `model_tools.py` validates and prepares the call.
7. Bridge tools such as tool search/describe/call are handled specially.
8. Plugin hooks can block or modify the call.
9. The registry dispatches to the handler.
10. Tool output is normalized into a JSON-like result string.
11. The result is returned to the conversation loop.

### Conditions and Rules

- A tool must be registered before it can be called.
- Toolsets decide what the model can see.
- Some tools only appear if dependency checks pass.
- Some tools have dynamic schemas based on config or runtime state.
- Restricted sessions cannot bypass tool restrictions through bridge tools.
- File mutation tools may require approval in ACP/editor contexts.

### Output

The tool system returns structured tool results or structured error messages.

### Errors and Edge Cases

- missing tool
- disabled toolset
- failed dependency check
- invalid arguments
- plugin blocks tool
- handler exception
- async event loop issues
- large output needing truncation or summarization
- unsafe path or URL

## 4.4 Terminal and Code Execution

### What It Does

Hermes can run commands, manage processes, and execute code through configured terminal environments. This makes the agent useful for local development tasks, but it is also one of the highest-risk capabilities.

### Controlled By

- `tools/terminal_tool.py`
- `tools/code_execution_tool.py`
- `tools/process_registry.py`
- `tools/environments/`
- `hermes_cli/config.py`

### Data It Uses

- command string
- working directory
- configured terminal backend
- timeout settings
- environment passthrough list
- shell initialization behavior
- process registry state

### Step-by-Step Logic

1. Model requests a terminal or code execution tool.
2. Tool checks the configured backend and environment settings.
3. Working directory and environment are prepared.
4. The command or code is executed.
5. Output, errors, exit status, and timeout data are captured.
6. Long-running processes may be registered for later inspection or control.
7. Output is returned to the model.

### Conditions and Rules

- Terminal backend can be local or configured for isolated/remote execution.
- Commands have timeouts.
- Environment variable passthrough is configurable.
- Some dangerous environment variables are blocked from dashboard writing.
- Tool output may be truncated or summarized depending on output settings.

### Output

The tool returns stdout, stderr, exit code, timeout status, process metadata, and sometimes a process ID.

### Errors and Edge Cases

- command not found
- permission denied
- timeout
- process hangs
- shell initialization fails
- backend unavailable
- unsafe environment variable propagation
- too much output

## 4.5 File Reading, Writing, Searching, and Patching

### What It Does

Hermes can inspect and modify local project files. It can read files, search paths, apply patches, write files, and verify mutations.

### Controlled By

- `tools/file_tools.py`
- `tools/file_operations.py`
- `tools/patch_parser.py`
- `tools/path_security.py`
- `tools/file_safety.py`
- `agent/conversation_loop.py` mutation-verifier behavior
- ACP edit approval modules

### Data It Uses

- file paths
- file contents
- search query
- patch instructions
- working directory
- mutation approval policy
- file safety rules

### Step-by-Step Logic

1. Model requests a file operation.
2. Path is normalized and checked.
3. Operation type is validated.
4. For reads, file content is returned with size/output controls.
5. For writes or patches, approval hooks may run.
6. Patch parser interprets requested edits.
7. File operation applies changes safely.
8. Mutation verifier can detect failed or suspicious writes.
9. Result is returned to the model.

### Conditions and Rules

- Paths should not escape allowed working directories.
- File mutation may be restricted by toolset or approval policy.
- Patch operations must match existing text or structure.
- Large files may be truncated or require targeted reading.
- File writes should be atomic where applicable.

### Output

The result tells the agent whether the operation succeeded, what changed, or what failed.

### Errors and Edge Cases

- file not found
- path traversal attempt
- binary or unsupported file
- large file
- failed patch match
- permission error
- concurrent modification
- failed file mutation footer added to final response

## 4.6 Web Search and Extraction

### What It Does

Hermes can search the web and extract page contents through configured tools and plugins. This helps the agent answer fresh or external-information questions.

### Controlled By

- `tools/web_tools.py`
- `tools/x_search_tool.py`
- web search provider plugins
- `tools/url_safety.py`
- config under web/network/search settings

### Data It Uses

- search query
- URL
- provider credentials
- network safety settings
- extracted page content

### Step-by-Step Logic

1. Model requests a search or extraction.
2. Tool checks whether search/extract provider is available.
3. Query or URL is validated.
4. URL safety logic may block unsafe/private/internal addresses depending on config.
5. Provider returns search results or page content.
6. Tool formats output for the model.

### Conditions and Rules

- Search provider must be configured or available.
- Private URL access is controlled by configuration.
- Output size limits apply.
- The model must cite or reason from results in final answer when relevant.

### Output

Search results, extracted page text, metadata, or errors.

### Errors and Edge Cases

- provider not configured
- network unavailable
- invalid URL
- blocked private URL
- extraction failure
- paywalled or script-heavy pages
- stale search results

## 4.7 Browser Automation

### What It Does

Browser tools let Hermes open pages, interact with browser state, and perform browser-based tasks.

### Controlled By

- `tools/browser_tool.py`
- `tools/browser_cdp_tool.py`
- `tools/browser_dialog_tool.py`
- `tools/browser_camofox.py`
- browser backend plugins
- config under browser/tool settings

### Data It Uses

- browser session state
- page URLs
- DOM/text/screenshot state
- configured browser backend
- user interaction targets

### Step-by-Step Logic

1. Model requests browser action.
2. Browser backend starts or reuses a session.
3. Action runs against page state.
4. Dialogs, screenshots, or page content may be captured.
5. Result is returned to the model.
6. Conversation cleanup closes stale browser resources when needed.

### Conditions and Rules

- Browser backend must be installed and configured.
- Some actions depend on visual or DOM availability.
- Browser sessions can become stale and require cleanup.
- Private URL controls may matter for navigation.

### Output

Browser observation, action result, page content, screenshot analysis, or error.

### Errors and Edge Cases

- browser launch failure
- page load timeout
- stale connection
- modal/dialog blocks action
- selector or target not found
- navigation blocked

## 4.8 Memory System

### What It Does

Memory lets Hermes retain useful information across sessions. Built-in memory uses local Markdown files. Optional plugins can provide external memory systems.

### Controlled By

- `agent/memory_manager.py`
- `tools/memory_tool.py`
- memory provider plugins
- `hermes_cli/config.py`

### Data It Uses

- `MEMORY.md` for agent/environment notes
- `USER.md` for user preferences/profile-like notes
- external memory provider data when configured
- memory injection context
- recent conversation turns

### Step-by-Step Logic

1. At startup, memory manager initializes built-in or external providers.
2. Built-in memory reads memory files from `~/.hermes/memories/`.
3. A bounded snapshot can be inserted into the system prompt.
4. During a conversation, external memory may be prefetched.
5. The model can call memory tools to add, replace, or remove memory.
6. Mid-session writes go to disk but do not rewrite the already-cached prompt immediately.
7. Memory sync may run after turns.
8. Streaming scrubbers prevent memory-only context from leaking visibly to the user.

### Conditions and Rules

- Only one external memory provider is allowed at a time.
- Memory entries have character limits.
- Entries are separated by a special delimiter in built-in memory files.
- Memory entries are scanned for prompt-injection and exfiltration patterns.
- Drift detection avoids overwriting manual changes silently.
- Duplicate memory entries are cleaned up.

### Output

Memory tools return success/failure results, updated entries, or context blocks. The model uses memory as background context.

### Errors and Edge Cases

- missing memory file
- corrupt or manually changed memory file
- duplicate entries
- injection-like memory content
- external provider unavailable
- too much memory content
- memory context accidentally appearing in output, mitigated by scrubbers

## 4.9 Skills System

### What It Does

Skills are reusable instruction packages or workflows that help the agent perform repeated tasks. Built-in and optional skills can be browsed, installed, audited, repaired, and used.

### Controlled By

- `tools/skills_tool.py`
- `tools/skill_manager_tool.py`
- `tools/skills_hub.py`
- `tools/skill_usage.py`
- `tools/skills_guard.py`
- `skills/`
- `optional-skills/`
- skills-related CLI/dashboard routes

### Data It Uses

- skill files
- skill metadata
- enabled/disabled skill state
- usage data
- optional hub/tap sources

### Step-by-Step Logic

1. Skills are discovered from built-in, optional, and user locations.
2. The system decides which skills are available or enabled.
3. The agent may review skills based on cadence or task need.
4. Skill content may influence the system prompt or tool behavior.
5. CLI/dashboard commands can install, update, inspect, audit, or remove skills.
6. Skill usage can be tracked.

### Conditions and Rules

- Skills must pass basic checks before use.
- Optional skills may need installation.
- Skill content can be security-sensitive because it affects agent behavior.
- Some cron jobs can request skill context, but scheduler scans prompts for injection risks.

### Output

The system provides skill descriptions, enabled states, prompt additions, or install/update/audit results.

### Errors and Edge Cases

- malformed skill
- missing metadata
- unsafe skill prompt
- unavailable optional source
- conflicting skill names
- excessive skill prompt size

## 4.10 Todo, Delegation, Kanban, and Multi-Agent Workflows

### What It Does

Hermes includes coordination features for complex tasks. It can maintain todo lists, delegate subtasks to subagents, combine multiple agent outputs, and manage kanban-style workflows.

### Controlled By

- `tools/todo_tool.py`
- `tools/delegate_tool.py`
- `tools/mixture_of_agents_tool.py`
- `tools/kanban_tools.py`
- kanban modules in `hermes_cli/`
- `agent/conversation_loop.py` delegation limits

### Data It Uses

- todo state
- subagent task prompts
- parent/child session metadata
- kanban boards and cards
- model/provider settings for subagents
- delegation budgets and limits

### Step-by-Step Logic

1. Agent identifies that a task may need planning or subdivision.
2. Todo tool can create or update task lists.
3. Delegate tool can create subagent calls for specific subtasks.
4. The conversation loop controls maximum delegate calls and deduplicates certain patterns.
5. Mixture-of-agents logic can collect multiple answers and synthesize a result.
6. Kanban tools can manage longer workflows or queued task cards.
7. Results return to the parent agent for final response.

### Conditions and Rules

- Delegation has caps to avoid runaway recursion.
- Restricted sessions may limit available tools for subagents.
- Kanban workers have timeout and activity reporting behavior.
- The model should not delegate when a simpler direct answer is enough.

### Output

Updated todo lists, subagent results, synthesized answers, kanban state changes, and final task summaries.

### Errors and Edge Cases

- subagent failure
- duplicated delegation
- runaway task loop
- timeout
- inconsistent subagent answers
- parent context too large after collecting results

## 4.11 Cron and Scheduled Automations

### What It Does

The cron system runs scheduled agent tasks. A job can be one-time or recurring and can optionally deliver results through configured messaging platforms.

### Controlled By

- `cron/jobs.py`
- `cron/scheduler.py`
- `tools/cronjob_tools.py`
- cron CLI commands
- dashboard cron routes

### Data It Uses

- job definitions in `~/.hermes/cron/jobs.json`
- schedule expressions
- job prompt
- toolsets and disabled toolsets
- output directory
- delivery targets
- lock files

### Step-by-Step Logic

1. User creates a job through CLI, dashboard, or tool.
2. Schedule is parsed as interval, cron expression, ISO time, or duration-like format.
3. Job is stored with an ID, name, prompt, state, and schedule.
4. Scheduler `tick()` checks due jobs.
5. A lock prevents overlapping scheduler runs.
6. Due jobs run in parallel or sequential pools depending on settings.
7. Interactive/dangerous toolsets such as messaging, clarify, and cronjob are disabled by default for cron runs unless configured otherwise.
8. Prompt plus skills are scanned for injection risk.
9. An agent run executes the job.
10. Output is saved locally.
11. Output may be delivered to a platform unless suppressed.
12. Next run time is calculated.

### Conditions and Rules

- Jobs can be paused/resumed.
- Job IDs are immutable.
- Output paths are protected against path traversal.
- `[SILENT]`-style markers can suppress delivery while still saving output.
- Schedules must parse successfully.
- Cron runs are non-interactive, so clarification tools are generally disabled.

### Output

Saved Markdown output, optional delivered message, updated job metadata, logs.

### Errors and Edge Cases

- invalid schedule
- missing job file
- corrupt jobs JSON
- locked scheduler
- agent failure
- unsafe prompt detected
- delivery platform unavailable
- output write failure

## 4.12 Messaging Gateway

### What It Does

The gateway lets Hermes respond on external chat platforms. It normalizes platform messages, maps them to sessions, runs the agent, and sends responses back.

### Controlled By

- `gateway/run.py`
- `gateway/session.py`
- `gateway/platforms/base.py`
- platform adapter files
- gateway CLI/dashboard commands

### Data It Uses

- platform config and credentials
- incoming message body
- chat ID, user ID, thread ID, platform ID
- session mappings
- active agent queues
- platform context prompts

### Step-by-Step Logic

1. Gateway starts and loads enabled platforms.
2. Each platform adapter connects to its platform.
3. A message arrives.
4. Adapter converts it to common source/message structure.
5. `gateway/session.py` builds a stable session key.
6. Session store resolves or creates a Hermes session.
7. Platform context is added to the system prompt.
8. Gateway dispatches the message into the agent.
9. Agent response is streamed or collected.
10. Adapter sends the reply, media, clarification, or error message back.
11. Gateway updates session metadata and active state.

### Conditions and Rules

- DMs, group chats, channels, and threads use different session-key rules.
- Threads may share or isolate sessions depending on config.
- Some platform contexts are redacted for privacy.
- Gateway can suspend, resume, reset, or expire sessions.
- Platform adapters may implement typing indicators, drafts, documents, images, voice, and slash confirmations.

### Output

Messages sent back to the platform, updated session DB rows, logs, gateway status.

### Errors and Edge Cases

- platform disconnected
- invalid token
- chat permission error
- gateway restart during message
- duplicate events
- long-running agent response
- session mapping conflict
- media upload failure
- unsafe platform context

## 4.13 Web Dashboard

### What It Does

The dashboard is a browser UI for managing Hermes. It provides chat, configuration, models, sessions, cron jobs, skills, plugins, logs, system status, webhooks, channels, profiles, MCP servers, and analytics.

### Controlled By

- `hermes_cli/web_server.py`
- `web/src/App.tsx`
- `web/src/pages/*`
- `web/src/components/*`
- `web/src/lib/api.ts`
- `web/src/lib/gatewayClient.ts`

### Data It Uses

- config YAML
- environment variables
- SQLite sessions/messages
- logs
- model metadata
- gateway state
- cron job definitions
- plugin/skill metadata
- profile settings

### Step-by-Step Logic

1. Browser loads React app.
2. App initializes layout, theme, routes, and API clients.
3. Pages request data from FastAPI routes.
4. User edits config, cron, profiles, skills, plugins, or sessions.
5. Backend route validates and applies the change.
6. Some actions trigger long-running operations like restart, doctor, backup, security audit, or plugin install.
7. WebSockets stream chat, events, PTY, or dashboard updates.

### Conditions and Rules

- Some settings are sensitive and require careful handling.
- Environment editing uses a denylist to avoid writing dangerous subprocess-affecting variables.
- Some actions depend on gateway running.
- Dashboard plugins can extend the UI.
- Auth should be enabled for non-local deployments.

### Output

Updated UI state, saved config, new sessions, logs, model/provider validation results, cron updates, plugin installs, and streamed chat events.

### Errors and Edge Cases

- backend unavailable
- invalid config
- env write blocked
- provider validation fails
- websocket disconnect
- plugin install fails
- gateway action fails
- stale session list

## 4.14 Terminal UI

### What It Does

The TUI provides an interactive terminal experience with richer UI than plain CLI: streaming markdown, slash commands, session switching, overlays, model picker, todo panel, voice controls, and active session display.

### Controlled By

- `tui_gateway/server.py`
- `ui-tui/src/gatewayClient.ts`
- `ui-tui/src/app/useMainApp.ts`
- `ui-tui/src/components/*`
- `ui-tui/src/app/slash/commands/*`

### Data It Uses

- JSON-RPC messages
- session lists
- chat history
- streaming events
- slash command results
- model list
- local UI state

### Step-by-Step Logic

1. TUI launches and connects to the Python TUI gateway.
2. Gateway sends startup/session/model status.
3. User types text or slash commands.
4. TUI sends command or message over JSON-RPC.
5. Gateway runs the requested backend operation.
6. Agent events stream back.
7. TUI updates message list, tool call displays, overlays, and status bars.

### Conditions and Rules

- JSON-RPC stdout must remain clean.
- Slow operations run in a worker pool.
- Crashes are logged to a panic/crash log.
- Slash commands can trigger session, skills, shell, compression, and other backend behavior.

### Output

Interactive terminal display and updated session state.

### Errors and Edge Cases

- gateway startup timeout
- malformed JSON-RPC
- backend crash
- disconnected process
- slow command timeout
- terminal rendering issue

## 4.15 Desktop Shell and Installer

### What It Does

The desktop app packages Hermes as a native Electron application. The bootstrap installer provides a native Tauri-based setup flow.

### Controlled By

- `apps/desktop/package.json`
- `apps/desktop/electron/*`
- `apps/desktop/src/*`
- `apps/bootstrap-installer/*`
- `apps/shared/*`

### Data It Uses

- local Hermes backend status
- installer progress
- app configuration
- desktop UI state
- packaged native dependencies

### Step-by-Step Logic

1. Desktop app starts Electron main process.
2. Renderer loads a React UI.
3. Main process checks or starts necessary backend pieces.
4. UI communicates with backend services.
5. Packaging scripts stage native dependencies and build platform-specific artifacts.
6. Installer app can drive setup scripts with a user-friendly UI.

### Conditions and Rules

- Electron build targets include macOS, Windows, and Linux packages.
- macOS entitlements mention microphone/audio usage for voice features.
- Native dependencies need special packaging/unpacking rules.
- Setup must handle existing and fresh installs.

### Output

Native app window, packaged releases, installer progress.

### Errors and Edge Cases

- backend not installed
- native dependency missing
- platform-specific packaging failure
- microphone permission issue
- installer script failure

## 4.16 Plugin System

### What It Does

Plugins extend Hermes without editing the core source. They can add providers, platforms, memory systems, tools, hooks, dashboard behavior, and transformations.

### Controlled By

- `hermes_cli/plugins.py`
- `plugins/`
- plugin metadata files
- plugin `register(ctx)` functions

### Data It Uses

- plugin directories
- plugin metadata
- config enable/disable flags
- hook registrations
- dependency checks

### Step-by-Step Logic

1. Hermes scans bundled plugins.
2. It scans user plugins under the Hermes home directory.
3. It can scan project plugins if that option is enabled.
4. It can load package entry-point plugins.
5. Each plugin metadata file is parsed.
6. The plugin module is imported.
7. The plugin registers hooks, tools, providers, platforms, or UI extensions.
8. Runtime code calls plugin hooks at specific points.

### Conditions and Rules

- Plugin kinds include standalone, backend, exclusive, platform, and model-provider.
- Hooks can run before/after tool calls, model calls, API requests, gateway dispatch, approvals, and session lifecycle events.
- Plugins are powerful and should be treated as trusted code.

### Output

New capabilities, transformed behavior, extra tools/providers/platforms, dashboard extensions.

### Errors and Edge Cases

- plugin import failure
- missing dependency
- conflicting plugin names
- hook exception
- plugin blocks valid behavior
- unsafe plugin code

## 4.17 ACP / Editor Client Integration

### What It Does

The ACP adapter appears to provide an Agent Client Protocol interface so editor clients or external agent clients can communicate with Hermes. It also integrates edit approvals for file mutations.

### Controlled By

- `acp_adapter/entry.py`
- `acp_adapter/server.py`
- `acp_adapter/session.py`
- `acp_adapter/tools.py`
- `acp_adapter/edit_approval.py`
- `acp_adapter/permissions.py`
- `acp_adapter/auth.py`

### Data It Uses

- ACP session state
- client authentication
- permission policy
- edit approval state
- tool requests

### Step-by-Step Logic

1. `hermes-acp` starts the ACP adapter.
2. Client authenticates or connects according to adapter rules.
3. Adapter creates or resumes an agent session.
4. Tool calls and events are translated between ACP and Hermes formats.
5. File mutation actions may request approval.
6. Approved actions proceed through normal tool dispatch.

### Conditions and Rules

- Permission policy controls what clients may do.
- File edits can require approval.
- ACP tool calls should respect the same restrictions as other tool calls.

### Output

ACP events, agent responses, approved or blocked edits.

### Errors and Edge Cases

- unauthorized client
- denied edit
- malformed protocol message
- tool mismatch
- session disconnect

---

# 5. Business Logic / Core Rules

## 5.1 Global Agent Rules

| Rule | Explanation |
|---|---|
| The model can only call tools that are exposed to it. | Toolsets and registry filtering define visible tools. |
| Tool calls must match a registered tool. | Unknown tools are rejected or handled as invalid. |
| The conversation loop is bounded. | Max iterations, token budgets, and failure counters prevent infinite loops. |
| Provider-specific message cleanup is required. | Different providers accept different message shapes. |
| Context may be compressed before it exceeds limits. | Compression keeps long sessions usable. |
| Final output must not leak internal context. | Thinking blocks, memory-only context, and internal tool details are scrubbed. |
| Sessions are persistent. | User and assistant messages are stored in SQLite unless disabled or special mode applies. |
| Plugins can modify behavior. | Hooks can transform, block, or extend model/tool/session/gateway behavior. |

## 5.2 Permission and Toolset Rules

| Rule | Explanation |
|---|---|
| Toolsets are named capability bundles. | Examples include terminal, file, browser, web, memory, skills, cron, messaging, and webhook-safe. |
| Disabled toolsets subtract capabilities. | Config can remove risky tools even if a broad toolset is enabled. |
| Webhook-safe tools are restricted. | Webhook contexts get a smaller set, mainly safer search/extract/vision/clarify-type tools. |
| Cron jobs disable interactive or dangerous tools by default. | Scheduler removes tools such as clarify, messaging, and cronjob unless configured. |
| Bridge tools cannot bypass scope. | Tool search/describe/call respect the current allowed catalog. |
| ACP file edits may require approval. | File mutation is checked before write/patch actions in editor-client contexts. |

## 5.3 Model Routing and Fallback Rules

| Rule | Explanation |
|---|---|
| Primary provider comes from config/profile/CLI. | The runtime resolves model/provider before conversation. |
| API mode can be inferred. | Some providers are detected by base URL or model family. |
| Fallback activates only for supported failure cases. | Retry/fallback handling responds to provider errors, not arbitrary model disagreement. |
| Provider state is restored after fallback when appropriate. | The agent does not permanently switch provider just because one turn used fallback. |
| Token and cost stats are tracked. | Session metadata stores usage information. |

## 5.4 Memory Rules

| Rule | Explanation |
|---|---|
| Built-in memory is local Markdown. | Memory is stored in `MEMORY.md` and `USER.md`. |
| Memory content is bounded. | There are character limits for injected memory content. |
| Mid-session memory writes do not instantly rewrite the cached system prompt. | This avoids unstable prompt changes within a turn. |
| Memory entries are scanned for risky instruction patterns. | Prompt-injection-like entries can be blocked or flagged. |
| Only one external memory provider is active at a time. | Prevents ambiguous memory ownership. |

## 5.5 Session Rules

| Rule | Explanation |
|---|---|
| Every durable conversation has a session ID. | Sessions are stored in SQLite. |
| Messages are associated with sessions. | User, assistant, and tool messages are persisted. |
| Sessions can have parent/child relationships. | Delegation, rewinds, or descendants can create related sessions. |
| Search uses full-text indexes when available. | FTS and trigram search improve session lookup. |
| Gateway chats map to stable session keys. | DMs, groups, and threads are treated differently. |

## 5.6 Cron Rules

| Rule | Explanation |
|---|---|
| A job has a fixed ID. | Job identity is stable even if name or prompt changes. |
| The scheduler uses locking. | Prevents overlapping scheduler ticks. |
| Output is saved locally. | Delivery can fail, but local output is still important. |
| Schedule parsing supports multiple styles. | Durations, intervals, cron expressions, and ISO times are supported. |
| Silent output can suppress delivery. | Jobs may save results without sending them to a platform. |

## 5.7 Gateway Rules

| Rule | Explanation |
|---|---|
| Each platform adapter normalizes messages. | The agent sees a common internal format. |
| Session key depends on platform/chat/thread/user settings. | Prevents unrelated chats from mixing context. |
| Platform context is injected into prompts. | The model knows where the message came from. |
| Some PII is redacted in safe contexts. | Gateway tries to reduce sensitive exposure. |
| Adapter capabilities differ. | Not every platform supports every media or interaction feature. |

## 5.8 Configuration Rules

| Rule | Explanation |
|---|---|
| Config has defaults and migrations. | Older config files can be upgraded. |
| Corrupt config is backed up. | The system avoids destroying broken config unexpectedly. |
| Writes are atomic where practical. | Reduces risk of partial config writes. |
| Certain env vars are denied in dashboard writing. | Prevents accidentally setting variables like `PATH`, `PYTHONPATH`, `LD_PRELOAD`, and similar risky process-control values. |

---

# 6. Data and State Management

## 6.1 Data Stored by the Application

| Data Type | Storage | Purpose |
|---|---|---|
| Sessions | SQLite `state.db` | Track conversations, metadata, provider, costs, title, status. |
| Messages | SQLite `state.db` | Store user/assistant/tool messages and reasoning metadata. |
| Search indexes | SQLite FTS/trigram tables | Search session history. |
| Config | YAML file | Store model, provider, toolset, UI, gateway, cron, browser, compression, security, and plugin settings. |
| Environment values | `.env` and secret sources | API keys and provider credentials. |
| Memory | Markdown files or memory providers | Persistent user/agent memory. |
| Cron jobs | JSON file | Scheduled task definitions. |
| Cron output | Markdown files | Saved scheduled task results. |
| Gateway session mapping | SQLite and mapping files | Map platform chats to Hermes sessions. |
| Logs | Log files | Diagnostics, gateway/TUI/server crashes, operations. |
| Skills/plugins | Local directories | Extend behavior. |
| Dashboard state | Browser/local app state + backend config | UI preferences and live status. |

## 6.2 SQLite Session Database

`hermes_state.py` defines a local SQLite database with schema migration support. It uses WAL mode when possible, with fallback behavior for filesystems where WAL causes locking problems.

Important tables include:

| Table | Meaning |
|---|---|
| `schema_version` | Tracks current DB schema version. |
| `sessions` | One row per conversation session. Stores source, user ID, model, prompt metadata, start/end time, cost, cwd, title, archive state, parent session, and more. |
| `messages` | Stores individual user/assistant/tool messages with content, role, timestamps, tool calls, reasoning fields, provider items, and active/observed flags. |
| `state_meta` | Key-value state metadata. |
| `compression_locks` | Prevents conflicting compression work on the same session. |
| gateway topic tables | Track Telegram/platform topic bindings. |
| FTS virtual tables | Enable full-text and trigram search for messages. |

## 6.3 Session CRUD Logic

| Operation | Logic |
|---|---|
| Create session | Insert session row with source, model, prompt, cwd, parent, and metadata. |
| Append message | Insert message row linked to session. |
| Replace messages | Used for rewinds, compression, or session repair flows. |
| End session | Mark ended time and reason. |
| Reopen session | Clear or adjust ended state so it can continue. |
| Search sessions | Use FTS/trigram if available, fallback if not. |
| Export session | Convert stored messages/metadata into a portable format. |
| Prune/delete/clear | Remove or archive sessions depending on command. |

## 6.4 Configuration State

`hermes_cli/config.py` defines a large default configuration. Major groups include:

| Config Group | Purpose |
|---|---|
| `model`, `providers`, `fallback_providers` | Provider/model selection and fallback behavior. |
| `toolsets`, `agent.disabled_toolsets` | Tool capability control. |
| `agent` | Turn limits, gateway timeouts, retries, notification cadence, image input mode, completion guidance. |
| `terminal` | Backend, cwd, timeouts, environment passthrough, shell behavior, container/remote options. |
| `web`, `browser`, `network` | Web extraction/search and browser behavior. |
| `compression` | Context compression thresholds. |
| `prompt_caching` | Provider prompt caching settings. |
| `memory` | Memory provider and built-in memory behavior. |
| `delegation` | Subagent and delegation limits. |
| `skills`, `curator` | Skill discovery, review, and curation behavior. |
| platform configs | Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, webhooks, and others. |
| `cron` | Scheduled job behavior. |
| `security`, `approvals` | Security checks and approval workflows. |
| `dashboard`, `display`, `streaming` | UI and streaming settings. |
| `sessions`, `logging`, `updates` | Persistence, logs, and update behavior. |

The config loader merges user config with defaults, migrates old versions, and backs up corrupt files.

## 6.5 Memory Data Structures

Built-in memory uses two conceptual files:

| Memory File | Purpose |
|---|---|
| `MEMORY.md` | Notes useful to the agent about environment, recurring tasks, or agent behavior. |
| `USER.md` | Notes about user preferences or stable user instructions. |

The memory tool supports actions like:

- add a memory entry
- replace matching memory entry
- remove matching memory entry
- choose whether the target is general memory or user memory

Important behavior:

- entries are bounded
- duplicate entries are cleaned
- risky entries are scanned
- manual file drift is detected before writes
- memory snapshots are separated from mid-session disk updates

## 6.6 Cron Data Structures

A cron job conceptually contains:

| Field | Meaning |
|---|---|
| job ID | Stable unique job identity. |
| name | Human-readable name. |
| prompt | What the agent should do. |
| schedule | Time rule. |
| state | Active, paused, disabled, completed, or similar status. |
| toolsets | Optional allowed tools for the job. |
| disabled toolsets | Additional blocked capabilities. |
| delivery settings | Optional platform/channel delivery. |
| output metadata | Where saved results are stored. |

## 6.7 Gateway Session Data

The gateway has to decide which external chat maps to which Hermes conversation. It uses:

| Data | Meaning |
|---|---|
| platform | Telegram, Discord, Slack, etc. |
| chat ID | The room, DM, group, or channel. |
| chat type | DM, group, channel, thread. |
| user ID | Person who sent the message. |
| thread ID | Optional thread/topic ID. |
| session key | Stable internal key generated from the above. |
| session ID | Actual Hermes session in SQLite. |

The key rule is: do not mix unrelated conversations, but allow continuing the same conversation when messages come from the same chat context.

## 6.8 Frontend State

The React dashboard and TUI maintain UI state such as:

- selected page or route
- current chat input
- current session
- message list
- streaming state
- theme/language/sidebar state
- model picker state
- modal/dialog visibility
- cron/job form state
- plugin/skill/config editing state

Persistent data still lives mostly on the backend or local files.

---

# 7. API / Backend / Services Logic

## 7.1 Backend Components

Hermes has several backend-style services:

| Backend | File | Purpose |
|---|---|---|
| Agent runtime | `run_agent.py`, `agent/*` | Main conversation/tool loop. |
| Dashboard API | `hermes_cli/web_server.py` | FastAPI routes for UI operations. |
| TUI gateway | `tui_gateway/server.py` | JSON-RPC service for terminal UI. |
| Messaging gateway | `gateway/run.py` | Connects chat platforms to agent sessions. |
| Cron scheduler | `cron/scheduler.py` | Runs scheduled jobs. |
| ACP server | `acp_adapter/server.py` | Editor/client protocol adapter. |

## 7.2 Dashboard API Route Inventory

The FastAPI server exposes many routes. Grouped by purpose:

### Status and Operations

| Route | Purpose |
|---|---|
| `GET /api/status` | Basic backend/dashboard status. |
| `GET /api/system/stats` | System stats. |
| `POST /api/ops/prompt-size` | Inspect prompt size. |
| `POST /api/ops/dump` | Generate diagnostic dump. |
| `POST /api/ops/config-migrate` | Run config migration. |
| `POST /api/ops/debug-share` | Create debug share data. |
| `POST /api/ops/doctor` | Run doctor checks. |
| `POST /api/ops/security-audit` | Run security audit. |
| `POST /api/ops/backup` | Backup state/config. |
| `POST /api/ops/import` | Import backup or data. |
| `GET /api/ops/hooks` | List hooks. |
| `POST /api/ops/hooks` | Create/update hook. |
| `DELETE /api/ops/hooks` | Delete hook. |
| `GET /api/ops/checkpoints` | List checkpoints. |
| `POST /api/ops/checkpoints/prune` | Prune checkpoints. |

### Hermes Update and Gateway Control

| Route | Purpose |
|---|---|
| `POST /api/hermes/update` | Trigger update. |
| `GET /api/hermes/update/check` | Check for update. |
| `POST /api/gateway/start` | Start messaging gateway. |
| `POST /api/gateway/stop` | Stop messaging gateway. |
| `POST /api/gateway/restart` | Restart messaging gateway. |

### Config, Environment, Models, and Providers

| Route | Purpose |
|---|---|
| `GET /api/config` | Read active config. |
| `PUT /api/config` | Update config. |
| `GET /api/config/defaults` | Get default config. |
| `GET /api/config/schema` | Get config schema/metadata. |
| `GET /api/config/raw` | Read raw config. |
| `PUT /api/config/raw` | Write raw config. |
| `GET /api/env` | Read environment entries. |
| `PUT /api/env` | Write environment entries. |
| `DELETE /api/env` | Delete environment entries. |
| `POST /api/env/reveal` | Reveal selected secret value. |
| `GET /api/model/info` | Read current model info. |
| `GET /api/model/options` | List model options. |
| `GET /api/model/recommended-default` | Get recommended model. |
| `GET /api/model/auxiliary` | Read auxiliary model settings. |
| `POST /api/model/set` | Set active model. |
| `POST /api/providers/validate` | Validate provider credentials/config. |
| `GET /api/providers/oauth` | List OAuth provider states. |
| `DELETE /api/providers/oauth/{provider_id}` | Remove OAuth provider authorization. |
| `POST /api/providers/oauth/{provider_id}/start` | Start OAuth flow. |
| `POST /api/providers/oauth/{provider_id}/submit` | Submit OAuth data. |
| `GET /api/providers/oauth/{provider_id}/poll/{session_id}` | Poll OAuth session. |
| `DELETE /api/providers/oauth/sessions/{session_id}` | Clear OAuth session. |
| `GET /api/credentials/pool` | List credential pool. |
| `POST /api/credentials/pool` | Add credential. |
| `DELETE /api/credentials/pool/{provider}/{index}` | Delete credential. |

### Sessions

| Route | Purpose |
|---|---|
| `GET /api/sessions` | List sessions. |
| `GET /api/profiles/sessions` | List profile-related sessions. |
| `GET /api/sessions/search` | Search sessions. |
| `POST /api/sessions/bulk-delete` | Delete multiple sessions. |
| `GET /api/sessions/empty/count` | Count empty sessions. |
| `DELETE /api/sessions/empty` | Delete empty sessions. |
| `GET /api/sessions/stats` | Session stats. |
| `GET /api/sessions/{session_id}` | Read session details. |
| `GET /api/sessions/{session_id}/latest-descendant` | Find descendant session. |
| `GET /api/sessions/{session_id}/messages` | Read messages. |
| `DELETE /api/sessions/{session_id}` | Delete session. |
| `PATCH /api/sessions/{session_id}` | Update session metadata. |
| `GET /api/sessions/{session_id}/export` | Export session. |
| `POST /api/sessions/prune` | Prune sessions. |

### Logs, Audio, and Actions

| Route | Purpose |
|---|---|
| `GET /api/logs` | Read logs. |
| `POST /api/audio/transcribe` | Transcribe audio. |
| `GET /api/audio/elevenlabs/voices` | List voices. |
| `POST /api/audio/speak` | Text-to-speech. |
| `GET /api/actions/{name}/status` | Check operation status. |

### Messaging Platforms

| Route | Purpose |
|---|---|
| `POST /api/messaging/telegram/onboarding/start` | Start Telegram onboarding. |
| `GET /api/messaging/telegram/onboarding/{pairing_id}` | Check onboarding. |
| `POST /api/messaging/telegram/onboarding/{pairing_id}/apply` | Apply onboarding result. |
| `DELETE /api/messaging/telegram/onboarding/{pairing_id}` | Cancel onboarding. |
| `GET /api/messaging/platforms` | List messaging platforms. |
| `PUT /api/messaging/platforms/{platform_id}` | Update platform config. |
| `POST /api/messaging/platforms/{platform_id}/test` | Test platform. |

### Cron Jobs

| Route | Purpose |
|---|---|
| `GET /api/cron/jobs` | List jobs. |
| `GET /api/cron/jobs/{job_id}` | Read job. |
| `POST /api/cron/jobs` | Create job. |
| `PUT /api/cron/jobs/{job_id}` | Update job. |
| `POST /api/cron/jobs/{job_id}/pause` | Pause job. |
| `POST /api/cron/jobs/{job_id}/resume` | Resume job. |
| `POST /api/cron/jobs/{job_id}/trigger` | Run job now. |
| `DELETE /api/cron/jobs/{job_id}` | Delete job. |

### MCP, Pairing, Webhooks, Memory

| Route | Purpose |
|---|---|
| `GET /api/mcp/servers` | List MCP servers. |
| `POST /api/mcp/servers` | Add MCP server. |
| `DELETE /api/mcp/servers/{name}` | Remove MCP server. |
| `POST /api/mcp/servers/{name}/test` | Test MCP server. |
| `PUT /api/mcp/servers/{name}/enabled` | Enable/disable MCP server. |
| `GET /api/mcp/catalog` | MCP catalog. |
| `POST /api/mcp/catalog/install` | Install MCP server from catalog. |
| `GET /api/pairing` | List pairing state. |
| `POST /api/pairing/approve` | Approve pairing. |
| `POST /api/pairing/revoke` | Revoke pairing. |
| `POST /api/pairing/clear-pending` | Clear pending pairing. |
| `GET /api/webhooks` | List webhooks. |
| `POST /api/webhooks` | Create webhook. |
| `DELETE /api/webhooks/{name}` | Delete webhook. |
| `PUT /api/webhooks/{name}/enabled` | Enable/disable webhook. |
| `GET /api/memory` | Read memory provider status. |
| `PUT /api/memory/provider` | Set memory provider. |
| `POST /api/memory/reset` | Reset memory. |

### Skills, Profiles, Tools, Analytics

| Route | Purpose |
|---|---|
| `POST /api/skills/hub/install` | Install skill. |
| `POST /api/skills/hub/uninstall` | Uninstall skill. |
| `POST /api/skills/hub/update` | Update skill. |
| `GET /api/skills/hub/search` | Search skills hub. |
| `GET /api/skills` | List skills. |
| `PUT /api/skills/toggle` | Enable/disable skill. |
| `GET /api/profiles` | List profiles. |
| `POST /api/profiles` | Create profile. |
| `GET /api/profiles/active` | Read active profile. |
| `POST /api/profiles/active` | Set active profile. |
| `GET /api/profiles/{name}/setup-command` | Get setup command. |
| `POST /api/profiles/{name}/open-terminal` | Open terminal for profile. |
| `PATCH /api/profiles/{name}` | Update profile. |
| `DELETE /api/profiles/{name}` | Delete profile. |
| `GET /api/profiles/{name}/soul` | Read profile soul/persona. |
| `PUT /api/profiles/{name}/soul` | Update profile soul/persona. |
| `PUT /api/profiles/{name}/description` | Update profile description. |
| `PUT /api/profiles/{name}/model` | Set profile model. |
| `POST /api/profiles/{name}/describe-auto` | Generate/refresh profile description. |
| `GET /api/tools/toolsets` | List toolsets. |
| `PUT /api/tools/toolsets/{name}` | Toggle toolset. |
| `GET /api/tools/toolsets/{name}/config` | Read toolset config. |
| `PUT /api/tools/toolsets/{name}/provider` | Set toolset provider. |
| `GET /api/analytics/usage` | Usage analytics. |
| `GET /api/analytics/models` | Model analytics. |

### Dashboard Plugins and Themes

| Route | Purpose |
|---|---|
| `GET /api/dashboard/themes` | List dashboard themes. |
| `PUT /api/dashboard/theme` | Set dashboard theme. |
| `GET /api/dashboard/plugins` | List dashboard plugins. |
| `GET /api/dashboard/plugins/rescan` | Rescan plugins. |
| `GET /api/dashboard/plugins/hub` | Dashboard plugin hub. |
| `POST /api/dashboard/agent-plugins/install` | Install agent plugin. |
| `POST /api/dashboard/agent-plugins/{name:path}/enable` | Enable plugin. |
| `POST /api/dashboard/agent-plugins/{name:path}/disable` | Disable plugin. |
| `POST /api/dashboard/agent-plugins/{name:path}/update` | Update plugin. |
| `DELETE /api/dashboard/agent-plugins/{name:path}` | Delete plugin. |
| `PUT /api/dashboard/plugin-providers` | Configure plugin providers. |
| `POST /api/dashboard/plugins/{name:path}/visibility` | Set plugin visibility. |
| `GET /dashboard-plugins/{plugin_name}/{file_path:path}` | Serve plugin static files. |

### WebSockets

| Route | Purpose |
|---|---|
| `WS /api/pty` | Terminal/PTY stream. |
| `WS /api/ws` | Main chat or dashboard websocket. |
| `WS /api/pub` | Publish/subscribe style events. |
| `WS /api/events` | Event stream. |

## 7.3 Request and Response Flow

A dashboard request generally follows this pattern:

1. Frontend calls an API helper in `web/src/lib/api.ts`.
2. Browser sends HTTP request or opens WebSocket.
3. `hermes_cli/web_server.py` route receives it.
4. Route validates request body/path/query.
5. Route calls the relevant internal module.
6. Internal module reads or writes local config, SQLite, job files, plugin state, or starts a runtime action.
7. Route returns JSON result or streams events.
8. Frontend updates UI state.

## 7.4 Authentication and Authorization Logic

The source includes auth-related pieces for:

- dashboard authentication plugins/settings
- provider OAuth flows
- ACP authentication
- messaging platform credentials
- pairing flows
- secret/credential pool management

However, Hermes is primarily a local tool. Security depends strongly on deployment mode:

- On a local-only dashboard, risk is lower but still meaningful.
- On a network-exposed dashboard, auth must be enabled and carefully configured.
- Messaging gateway tokens must be protected.
- Plugins and tools should be treated as privileged code.

## 7.5 Middleware and Error Handling

Backend error handling patterns include:

- returning structured JSON errors
- catching provider/tool exceptions
- logging stack traces to log files
- using action status endpoints for long operations
- backing up corrupt config before fallback
- using database migrations and fallbacks
- using locks for cron and compression
- websocket disconnect handling

## 7.6 Third-Party Services and Integrations

The project supports many integrations through dependencies and plugins:

| Integration Area | Examples |
|---|---|
| Model providers | OpenAI-compatible APIs, Anthropic, Bedrock, Gemini, OpenRouter, Nous, xAI, Azure-like setups, and provider plugins. |
| Search/extraction | Exa, Firecrawl, web search plugins, X search. |
| Messaging | Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, SMS, Feishu, DingTalk, WeCom, Weixin, BlueBubbles, Home Assistant, QQBot, Yuanbao. |
| Browser | CDP/browser automation backends and browser plugins. |
| Memory providers | Honcho, Hindsight, Mem0, Supermemory, and other memory plugins. |
| Media | Image generation, video generation, transcription, TTS, ElevenLabs-style voice listing, edge TTS. |
| Execution environments | Local shell, Docker, SSH, Singularity, Modal, Daytona-like remote execution. |
| MCP | MCP server management and catalog installation. |
| Desktop | Electron. |
| Installer | Tauri. |

---

# 8. User Interface Logic

## 8.1 CLI Interface

The CLI is the oldest and broadest control surface. It includes commands for:

- running the agent interactively
- selecting models and fallback providers
- managing secrets and auth
- starting/stopping/restarting gateway
- managing cron jobs
- sending messages
- launching the portal/dashboard
- managing webhooks
- managing kanban work
- running doctor/security/backup/import commands
- managing config and environment
- managing skills, bundles, plugins, curator, memory, tools, MCP, sessions, and profiles
- updating or uninstalling Hermes

The CLI often acts as a thin orchestration layer around core modules.

## 8.2 Web Dashboard Pages

| Page | Purpose |
|---|---|
| `ChatPage.tsx` | Chat with Hermes from the browser. |
| `SessionsPage.tsx` | Browse, search, export, patch, archive, delete, and inspect sessions. |
| `ConfigPage.tsx` | Edit structured configuration. |
| `EnvPage.tsx` | Manage environment variables and secrets. |
| `ModelsPage.tsx` | Choose and inspect model/provider settings. |
| `CronPage.tsx` | Create, edit, pause, resume, trigger, and delete scheduled jobs. |
| `SkillsPage.tsx` | Manage installed/enabled skills. |
| `PluginsPage.tsx` | Manage plugins. |
| `ChannelsPage.tsx` | Messaging platform setup and status. |
| `WebhooksPage.tsx` | Manage webhook endpoints. |
| `ProfilesPage.tsx` | Manage named profiles/personas/model setups. |
| `McpPage.tsx` | Manage MCP servers and catalog installs. |
| `LogsPage.tsx` | Read backend logs. |
| `SystemPage.tsx` | View system status and operations. |
| `AnalyticsPage.tsx` | Usage and model analytics. |
| `DocsPage.tsx` | Documentation inside dashboard. |

## 8.3 Web Components

| Component | Role |
|---|---|
| `ModelPickerDialog.tsx` | Lets user choose a model/provider. |
| `ModelInfoCard.tsx` | Displays model details. |
| `ScheduleBuilder.tsx` | Helps build cron schedules. |
| `ToolCall.tsx` | Displays tool calls in chat/history. |
| `Markdown.tsx` | Renders Markdown responses. |
| `ChatSidebar.tsx` | Session/chat navigation. |
| `SidebarStatusStrip.tsx` | Shows backend/gateway/system status. |
| `OAuthLoginModal.tsx` and OAuth cards | Provider login flows. |
| `PlatformsCard.tsx` | Messaging platform setup/status. |
| `DeleteConfirmDialog.tsx` | Safe destructive action confirmation. |
| `ThemeSwitcher.tsx`, `LanguageSwitcher.tsx` | UI personalization. |

## 8.4 UI Changes Based on Data, Role, or State

The source does not look like a traditional multi-role business app with admin/cashier-style roles. Instead, UI changes are mostly based on:

- backend availability
- active model/provider
- gateway running/stopped state
- whether platform credentials exist
- whether plugins/skills are installed or enabled
- selected profile
- current session
- loading/error/empty states
- websocket connection state
- whether an operation is in progress
- dashboard plugin visibility
- authentication settings if dashboard auth is enabled

## 8.5 TUI Screens and Actions

The TUI provides:

- main chat window
- input box
- streaming assistant messages
- thinking/tool call displays
- slash command popover
- model picker
- active session switcher
- skills hub overlay
- agents/subagents overlay
- todo panel
- voice controls
- status/header/footer UI

User actions trigger JSON-RPC calls to the Python TUI gateway. The gateway then performs backend actions and streams state updates back.

## 8.6 Messaging UI Logic

Messaging platforms are not controlled by Hermes UI directly; they are external chat clients. Hermes reacts to incoming messages and sends replies.

Typical actions:

| User Action in Chat Platform | Hermes Background Action |
|---|---|
| Send a text message | Gateway maps chat to session and runs agent. |
| Send in a thread | Gateway uses thread-aware session key. |
| Trigger slash command or confirmation | Adapter normalizes command/confirmation. |
| Send media | Adapter may pass media metadata/content to tools if supported. |
| Wait for response | Gateway may send typing indicators or draft/update events. |

---

# 9. Important Algorithms or Special Logic

## 9.1 Main Agent Tool Loop

Plain-English pseudocode:

```text
prepare session and context
build messages and tool definitions
repeat until final answer or limit:
    send messages to model
    if model gives final response:
        clean response
        save and return
    if model asks for tools:
        validate each tool call
        execute allowed tools
        append tool results
        continue
if limits reached:
    ask model for best final answer without more tools
save diagnostics and return
```

Special behavior:

- cleans malformed messages before provider calls
- removes orphaned tool messages
- handles provider-specific reasoning fields
- compresses context when needed
- injects memory/plugin context only where intended
- retries provider calls
- falls back to alternate providers
- tracks cost and tokens
- detects failed file mutations

## 9.2 Tool Definition Caching

Tool definitions are expensive to assemble because tools can have dynamic schemas, dependency checks, plugin-provided tools, and config-specific availability.

Hermes caches tool definitions using a key based on:

- enabled toolsets
- disabled toolsets
- registry generation
- config state
- environment/tool availability
- special mode flags

This helps avoid rebuilding the same tool schema list on every turn.

## 9.3 Tool Bridge Logic

Hermes includes bridge-style tools such as:

- search available tools
- describe a tool
- call a tool indirectly

These are useful when the model should discover tools dynamically, but they are dangerous if unrestricted. Hermes scopes the bridge catalog to the same allowed tools visible in the current session, so a restricted session cannot use a bridge to reach hidden capabilities.

## 9.4 Session Key Generation for Gateway

The gateway session algorithm decides whether messages belong to the same agent conversation.

General logic:

```text
if message is from a direct message:
    key by platform + DM/chat/user/thread details
else if message is from group/channel:
    key by platform + chat type + chat ID
    optionally include user ID depending on config
    optionally include thread ID depending on config
canonicalize platform-specific IDs where needed
```

This prevents, for example, two different group chats from sharing memory by accident.

## 9.5 Context Compression

When conversations become too long, the agent needs to reduce token usage while keeping important information.

General flow:

1. Estimate prompt/message size.
2. If above threshold, lock compression for the session.
3. Summarize or compact older context.
4. Replace or mark older messages as compressed/inactive depending on method.
5. Continue conversation with shorter context.

Edge cases include concurrent compression, provider context errors, and preserving tool-call consistency.

## 9.6 Memory Injection and Scrubbing

Memory is useful but risky. Hermes fences memory context and tries to stop it from appearing directly in final output.

General logic:

1. Load bounded memory snapshot.
2. Wrap memory context in internal markers.
3. Insert it into system/user context where appropriate.
4. During streaming, scrub memory-only markers from visible output.
5. During final cleanup, remove internal memory context from user-visible response.

## 9.7 Cron Schedule Parsing and Execution

Cron jobs support several schedule forms:

- one-shot durations
- recurring intervals
- cron expressions
- ISO timestamps

Execution uses a scheduler lock. Due jobs are found, toolsets are restricted, prompts are scanned, an agent is launched, output is saved, and delivery may happen.

## 9.8 File Mutation Verification

The conversation loop tracks file mutation failures. If the model attempted file writes or patches and verification failed, the final answer can include a warning/footer so the user is not misled into thinking a file was changed successfully.

## 9.9 Provider Fallback Logic

If a provider call fails in a recoverable way:

1. Classify error.
2. Check retry count.
3. Check fallback provider list.
4. Switch runtime provider/model for the attempt.
5. Rebuild provider-compatible request if needed.
6. Continue or fail clearly if no fallback remains.

## 9.10 Prompt/Tool Safety Scanning

Security-related helpers scan memory entries, cron prompts, skills, URLs, and some tool contexts for known risky patterns. These checks are not a full sandbox, but they help catch common injection/exfiltration patterns.

## 9.11 Search, Filtering, and Sorting

Search/filtering happens in several places:

- SQLite FTS/trigram search for sessions and messages
- dashboard fuzzy filtering for UI lists
- skills hub search
- plugin listing and rescanning
- model/provider option filtering
- web search tools
- file search tools

The system generally prefers indexed backend search for persistent data and frontend fuzzy filtering for UI convenience.

---

# 10. Error Handling and Edge Cases

## 10.1 Agent-Level Errors

| Error | Handling |
|---|---|
| Provider auth failure | Return clear error, possibly try fallback if configured. |
| Rate limit | Retry/backoff/fallback depending on settings. |
| Context length exceeded | Trigger compression or final fallback behavior. |
| Empty model response | Retry or add final-turn explanation. |
| Invalid tool call | Reject tool call and inform model through tool result/error. |
| Tool exception | Convert to structured tool error result. |
| Max iterations reached | Ask model to produce a final summary without more tools. |
| Streaming failure | Cleanup callbacks and return partial/error state where possible. |

## 10.2 File Errors

| Error | Handling |
|---|---|
| Missing file | Return file-not-found style error. |
| Permission denied | Return permission error. |
| Unsafe path | Block operation. |
| Patch does not match | Return patch failure. |
| Binary/large file | Limit output or reject unsupported operation. |
| Failed mutation | Add verification warning to final response. |

## 10.3 Config Errors

| Error | Handling |
|---|---|
| Corrupt YAML | Backup corrupt file and fall back to defaults. |
| Old config version | Run migration. |
| Unsafe env variable write | Block or deny entry. |
| Missing provider key | Provider validation fails with actionable error. |
| Invalid raw config | Reject or report parsing/validation issue. |

## 10.4 Database Errors

| Error | Handling |
|---|---|
| WAL not supported by filesystem | Fall back to alternate journal mode. |
| Missing FTS support | Use fallback search. |
| Concurrent compression | Use compression locks. |
| Broken session state | Repair/resume/replace helpers exist. |

## 10.5 Gateway Errors

| Error | Handling |
|---|---|
| Platform disconnect | Reconnect or mark platform unhealthy. |
| Invalid platform token | Surface platform setup/test error. |
| Message delivery failure | Log and possibly return failure status. |
| Duplicate message | Session/queue logic helps avoid repeated work. |
| Long-running task | Active agent tracking and timeout settings apply. |
| Gateway restart | Runner drains/stops/restarts adapters. |

## 10.6 Cron Errors

| Error | Handling |
|---|---|
| Invalid schedule | Reject job or mark invalid. |
| Scheduler already locked | Skip/avoid overlapping tick. |
| Prompt flagged unsafe | Block or fail job. |
| Delivery fails | Save output locally anyway if possible. |
| Job output path unsafe | Reject path traversal. |

## 10.7 UI Errors

| Error | Handling |
|---|---|
| Backend unavailable | Show loading/error state. |
| WebSocket disconnect | Reconnect or show disconnected state. |
| Form validation failure | Display field-level or route-level error. |
| Long operation | Use action status endpoints or loading states. |
| Empty lists | Show empty state pages. |

---

# 11. Security and Privacy Review

## 11.1 Login and Auth Logic

Hermes is mainly a local agent system, but it includes several auth-sensitive areas:

- model provider API keys
- OAuth provider flows
- messaging platform tokens
- dashboard auth plugins/settings
- ACP authentication
- pairing approval flows
- credential pool management

The most important practical rule is: if the dashboard, gateway, or ACP server is exposed beyond localhost, authentication and network restrictions must be configured carefully.

## 11.2 Permission and Role-Based Access

This is not a classic role-based business app. Permissions are capability-based instead of user-role-based.

Important permission controls include:

- enabled/disabled toolsets
- platform-specific gateway restrictions
- webhook-safe toolset restrictions
- cron disabled toolsets
- ACP edit approvals
- plugin pre-tool-call hooks
- config-level security settings
- dashboard auth plugin/settings
- provider credential scope

## 11.3 Data Protection Logic

Security-positive behaviors found in the source include:

| Protection | Why It Matters |
|---|---|
| Local SQLite storage | User data can stay local if external providers are not used for content. |
| Config migration and corrupt-file backups | Avoids silent config loss. |
| Environment write denylist | Reduces risk of writing dangerous runtime variables through dashboard. |
| Memory injection scanning | Helps prevent malicious memory entries from controlling the agent. |
| Memory output scrubbers | Reduces accidental leakage of memory context. |
| URL safety checks | Can prevent access to private/internal resources depending on config. |
| Toolset restrictions | Limits capabilities per context. |
| Cron prompt scanning and restricted tools | Reduces scheduled-task abuse. |
| Gateway PII redaction in some context prompts | Reduces unnecessary personal data exposure. |
| ACP edit approval | Adds a confirmation layer for file mutations in supported clients. |
| Secure output path checks for cron | Blocks path traversal. |
| Extensive test suite | Indicates many edge cases and regressions are checked. |

## 11.4 Security Weaknesses or Risky Logic

These are the main risks to understand before production use:

| Risk | Explanation |
|---|---|
| Broad local power | If terminal and file tools are enabled, the agent can affect local files and processes. |
| Plugin execution | Plugins are Python code and should be treated as trusted software, not safe data. |
| Dashboard exposure | A network-exposed dashboard without strong auth would be dangerous. |
| Messaging gateway exposure | Bots connected to public platforms need strict allowlists and platform controls. |
| Local plaintext state | Sessions, memory, config, logs, and possibly secrets may exist on disk. Protect filesystem access. |
| Plaintext sensitive config possibilities | The example environment supports many keys and may include highly sensitive values. Avoid storing unnecessary secrets. |
| External providers receive prompts | If using cloud models, conversation data and tool results may be sent externally. |
| Browser automation | Browser tools can reach websites and possibly internal resources if URL protections are relaxed. |
| Cron automation | Scheduled jobs may run without user supervision. Use narrow toolsets. |
| Tool output prompt injection | Web pages, files, and messages can contain hostile instructions. The model may still be influenced despite scanners. |
| Complex codebase | Large central files make manual security review harder. |

## 11.5 What Should Be Fixed or Hardened Before Production

Recommended hardening:

1. Enable dashboard authentication before any non-local exposure.
2. Bind dashboard/gateway services to localhost unless remote access is truly needed.
3. Use explicit allowlists for messaging users/channels.
4. Disable terminal and file mutation tools in untrusted contexts.
5. Use safer execution backends or containers for risky tasks.
6. Avoid storing privileged secrets in plaintext files when possible.
7. Use OS keyring or encrypted secret storage for provider keys.
8. Audit installed plugins and skills before enabling them.
9. Require approval for destructive file operations.
10. Restrict cron toolsets to the minimum needed.
11. Enable URL private-network blocking unless internal browsing is intentional.
12. Rotate platform/model provider credentials regularly.
13. Review logs and memory files for sensitive data.
14. Split and simplify large modules to reduce security review difficulty.

---

# 12. Limitations, Bugs, and Improvements

## 12.1 Possible Bugs or Weak Parts

| Area | Possible Weakness |
|---|---|
| Large central modules | Files like `hermes_cli/main.py`, `gateway/run.py`, `hermes_cli/web_server.py`, `agent/conversation_loop.py`, and `gateway/platforms/base.py` are very large, making maintenance harder. |
| Many integrations | Each provider/platform/plugin increases the number of possible failure modes. |
| Tool schema complexity | Dynamic tool schemas and bridge tools are powerful but can create edge cases. |
| Provider differences | Different model APIs may break assumptions about messages, tool calls, reasoning fields, or streaming. |
| Local plaintext state | Convenient, but risky on shared machines. |
| Cron safety | Non-interactive scheduled agents can still take risky actions if configured too broadly. |
| Gateway sessions | Complex chat/thread/session rules can cause unexpected context sharing if misconfigured. |
| Plugin trust | Plugins are flexible but not truly sandboxed. |
| Browser state | Browser automation can become stale or inconsistent. |
| Memory drift | Manual memory edits and automatic memory writes can conflict. |

## 12.2 Incomplete or Placeholder-Like Areas

From the structure, several areas are intentionally extension-based or optional rather than always complete out of the box:

- optional model providers require credentials or plugins
- optional browser backends may require installation
- optional MCP servers need configuration
- optional skills must be installed/enabled
- messaging platforms require tokens and platform-specific setup
- media generation/transcription/TTS depends on configured services
- desktop/installer packaging depends on platform build tooling
- dashboard auth depends on plugin/config choices

These are not necessarily bugs; they are modular design choices. But they mean a fresh installation may not have every advertised feature active immediately.

## 12.3 Practical Improvements

| Improvement | Benefit |
|---|---|
| Split large files into smaller routers/services | Easier testing, auditing, and onboarding. |
| Generate architecture docs from route/tool registries | Keeps documentation in sync with code. |
| Add a visual architecture diagram to docs | Helps new developers understand the system faster. |
| Make least-privilege toolsets the default | Safer first-run experience. |
| Add explicit risk labels to toolsets | Users can understand what enabling terminal/file/browser means. |
| Strengthen local secret storage | Reduce damage if local files are copied. |
| Add plugin sandbox or stronger signing/trust model | Safer plugin ecosystem. |
| Centralize permission policy | Avoid scattered safety rules across gateway/cron/tools/ACP. |
| Improve dashboard auth onboarding | Prevent accidental exposed dashboards. |
| Add typed config models for all sections | More reliable validation and editor support. |
| Separate dashboard API into routers | Easier route ownership and maintenance. |
| Improve memory conflict UI | Let users review automatic memory changes. |
| Add safer cron templates | Prevent broad scheduled agent permissions. |
| Add gateway session preview/debugger | Helps users see how chats map to sessions. |
| Add provider compatibility tests for each mode | Prevent regressions across model APIs. |

## 12.4 Refactoring Suggestions

Recommended refactor targets:

| Current Area | Suggested Refactor |
|---|---|
| `hermes_cli/main.py` | Split by command family: config, gateway, cron, skills, plugins, sessions, setup, diagnostics. |
| `hermes_cli/web_server.py` | Split into FastAPI routers by domain. |
| `gateway/run.py` | Split lifecycle, adapter management, queue processing, session handling, and delivery. |
| `agent/conversation_loop.py` | Split provider-call preparation, tool-loop execution, error recovery, compression, and persistence. |
| `gateway/platforms/base.py` | Split common message types, send methods, media methods, adapter lifecycle, and platform utilities. |
| Tool registry bridge behavior | Separate direct dispatch from bridge discovery/call tools. |
| Config defaults | Move massive defaults into typed schema files or domain-specific modules. |

---

# 13. Final Summary

## 13.1 Whole Application in Simple Words

Hermes Agent is a local-first AI agent platform. You talk to it through a terminal, web dashboard, desktop app, TUI, or messaging platform. Behind the scenes, it creates a session, builds a prompt using config/memory/skills/context, calls a model provider, lets the model use approved tools, saves the conversation, and returns an answer.

It is designed to be more than a chatbot. It can act on your machine, use external services, remember useful facts, run scheduled jobs, and integrate with many platforms.

## 13.2 Main Logic Summary

The core logic is:

1. Load config and environment.
2. Start an interface: CLI, TUI, web, desktop, gateway, cron, or ACP.
3. Create or resume an agent session.
4. Select model/provider and allowed toolsets.
5. Build system prompt, memory, skills, and platform context.
6. Call the model.
7. If the model requests tools, validate and run them.
8. Feed tool results back to the model.
9. Repeat until final answer or limit.
10. Save session, messages, token/cost stats, and logs.
11. Return output to the user or platform.

## 13.3 Most Important Files

| File | Why It Matters |
|---|---|
| `run_agent.py` | Main `AIAgent` wrapper and compatibility entry point. |
| `agent/agent_init.py` | Constructs the runtime agent object. |
| `agent/conversation_loop.py` | Runs the model/tool/final-answer loop. |
| `model_tools.py` | Dispatches model tool calls to actual tools. |
| `tools/registry.py` | Central tool registration and execution registry. |
| `toolsets.py` | Defines available capability groups. |
| `hermes_state.py` | Stores sessions/messages in SQLite. |
| `hermes_cli/main.py` | Main CLI command dispatcher. |
| `hermes_cli/config.py` | Default config, config loading, migration, and safe writing. |
| `hermes_cli/web_server.py` | Dashboard backend API. |
| `gateway/run.py` | Messaging gateway runtime. |
| `gateway/session.py` | Platform chat-to-session mapping. |
| `cron/jobs.py` | Scheduled job storage and schedule parsing. |
| `cron/scheduler.py` | Scheduled job execution. |
| `agent/memory_manager.py` | Memory provider orchestration. |
| `tools/memory_tool.py` | Built-in memory file logic. |
| `tui_gateway/server.py` | Backend for terminal UI. |
| `web/src/App.tsx` | Dashboard frontend shell. |
| `ui-tui/src/app/useMainApp.ts` | Main TUI frontend state controller. |
| `apps/desktop/` | Native desktop shell. |
| `plugins/` | Extension system implementations. |
| `acp_adapter/` | Agent Client Protocol/editor integration. |

## 13.4 Strong Parts

- Very broad capability set.
- Clear separation between core agent, tools, gateway, UI, cron, and plugins.
- Strong local-session persistence with SQLite and search.
- Powerful tool registry and toolset system.
- Multiple interfaces for different users.
- Extensive plugin architecture.
- Many safety checks around memory, URLs, cron, env writes, file approvals, and tool restrictions.
- Large test suite across many subsystems.
- Good support for fallback providers and provider-specific behavior.

## 13.5 Weak Parts

- Some files are extremely large and hard to audit.
- Broad default local capabilities can be risky.
- Plugins and skills require trust.
- Local plaintext state may expose sensitive data.
- Messaging and dashboard exposure require careful configuration.
- Many optional integrations create setup complexity.
- Provider compatibility is inherently fragile because provider APIs differ.
- Cron automations need stricter least-privilege defaults for safety.

## 13.6 Overall Understanding

The application is built around one main idea: **an AI model becomes useful when it has controlled access to tools, memory, sessions, and interfaces**.

Hermes wraps that idea into a complete platform:

- The **agent loop** decides and acts.
- The **tool registry** gives the agent capabilities.
- The **session DB** remembers conversations.
- The **memory system** remembers useful long-term facts.
- The **config system** controls behavior.
- The **gateway** lets the agent live in messaging apps.
- The **cron system** lets the agent run on a schedule.
- The **dashboard, TUI, CLI, and desktop shell** give users different ways to control it.
- The **plugin system** lets the app grow beyond its built-in features.

For studying the project, the best order is:

1. Read `README.md` for product intent.
2. Study `run_agent.py` to understand the public agent wrapper.
3. Study `agent/agent_init.py` to understand how the runtime is assembled.
4. Study `agent/conversation_loop.py` to understand model/tool execution.
5. Study `model_tools.py`, `tools/registry.py`, and `toolsets.py` to understand tools.
6. Study `hermes_state.py` to understand persistence.
7. Study `hermes_cli/config.py` to understand configuration.
8. Study `gateway/session.py` and `gateway/run.py` to understand messaging.
9. Study `cron/jobs.py` and `cron/scheduler.py` to understand automation.
10. Study `hermes_cli/web_server.py`, `web/src/`, `tui_gateway/`, and `ui-tui/src/` to understand the user interfaces.

That path gives a clear mental model of how the application works without needing to copy or memorize the original source.

---

# Appendix A. High-Level Architecture Diagram

```text
                 +-------------------+
                 | User Interfaces   |
                 | CLI / TUI / Web   |
                 | Desktop / Gateway |
                 +---------+---------+
                           |
                           v
                 +-------------------+
                 | Session Resolver  |
                 | SQLite / Gateway  |
                 +---------+---------+
                           |
                           v
                 +-------------------+
                 | Agent Runtime     |
                 | init + loop       |
                 +----+---------+----+
                      |         |
                      v         v
           +----------------+  +----------------+
           | Model Provider |  | Memory/Context |
           | APIs/Plugins   |  | Skills/Profile |
           +-------+--------+  +--------+-------+
                   |                    |
                   v                    v
             +--------------------------------+
             | Tool Registry and Toolsets     |
             +--------------------------------+
              |      |       |       |      |
              v      v       v       v      v
          Terminal  Files  Browser  Web   Cron/Gateway/etc.
```

# Appendix B. Main Runtime Sequence

```text
start interface
load config and env
create/resume session
initialize agent
assemble prompt, memory, skills, tools
call model
while model asks for tools:
    validate tool call
    run tool through registry
    append tool result
    call model again
clean final answer
save session/messages/stats
return response
```

# Appendix C. Suggested Study Checklist

Use this checklist when reading the source manually:

- [ ] Confirm how config is loaded and migrated in `hermes_cli/config.py`.
- [ ] Trace how `AIAgent` is created in `run_agent.py`.
- [ ] Follow `init_agent` in `agent/agent_init.py`.
- [ ] Follow one user message through `run_conversation` in `agent/conversation_loop.py`.
- [ ] Check how tools are collected in `model_tools.py`.
- [ ] Check how tools register and dispatch in `tools/registry.py`.
- [ ] Review `toolsets.py` to understand available capabilities.
- [ ] Review file and terminal tools before enabling them in real use.
- [ ] Review memory logic before trusting persistent memory.
- [ ] Review `hermes_state.py` to understand where conversations are stored.
- [ ] Review `gateway/session.py` before using group messaging.
- [ ] Review `cron/scheduler.py` before allowing scheduled agent actions.
- [ ] Review `hermes_cli/web_server.py` before exposing the dashboard.
- [ ] Review installed plugins and skills before enabling them.

# Appendix D. Source Inventory and Build/Runtime Metadata

## D.1 Repository Size Snapshot

The uploaded archive expands into a large repository with these major source areas:

| Area | Approximate Role |
|---|---|
| `agent/` | Core runtime and conversation behavior. |
| `tools/` | Built-in model-callable tools. |
| `hermes_cli/` | CLI, config, web dashboard backend, plugins, operations. |
| `gateway/` | Messaging platform gateway. |
| `cron/` | Scheduled automation system. |
| `web/` | React dashboard frontend. |
| `ui-tui/` | React/Ink terminal UI. |
| `tui_gateway/` | Python backend for TUI. |
| `apps/desktop/` | Electron desktop app. |
| `apps/bootstrap-installer/` | Tauri setup installer. |
| `plugins/` | Bundled plugins. |
| `skills/`, `optional-skills/` | Built-in and optional skill packages. |
| `tests/` | Broad regression and integration test coverage. |

## D.2 Python Package Metadata

The Python project is named `hermes-agent`. It targets Python 3.11 through versions below Python 3.14. The main script entry points are:

| Script | Entry Point | Meaning |
|---|---|---|
| `hermes` | `hermes_cli.main:main` | Main CLI. |
| `hermes-agent` | `run_agent:main` | Direct agent runner compatibility entry. |
| `hermes-acp` | `acp_adapter.entry:main` | ACP/editor integration server. |

Important Python dependency categories include:

- model/provider SDKs
- FastAPI and Uvicorn for the dashboard backend
- prompt-toolkit style terminal interaction
- Pydantic for validation
- cron/schedule utilities
- Markdown and rendering helpers
- process/system utilities
- optional extras for Anthropic, Google, Bedrock, Azure identity, Exa, Firecrawl, web/browser/voice/media/messaging/MCP integrations

## D.3 Node/Frontend Package Metadata

The root `package.json` uses workspaces for:

- `apps/*`
- `ui-tui`
- `ui-tui/packages/*`
- `web`

Major frontend/runtime technologies include:

| Area | Main Technology |
|---|---|
| Web dashboard | React + Vite. |
| Terminal UI | React/Ink-style terminal rendering. |
| Desktop app | Electron. |
| Bootstrap installer | Tauri. |
| Shared UI/state | TypeScript packages and shared components. |

## D.4 Test Suite Coverage Areas

The `tests/` folder is broad. The largest test areas cover:

| Test Area | What It Suggests |
|---|---|
| `tests/hermes_cli` | CLI/config/dashboard/operations are heavily tested. |
| `tests/gateway` | Messaging gateway behavior has many edge cases. |
| `tests/tools` | Tool registry and built-in tools are important and risk-sensitive. |
| `tests/agent` | Conversation loop and agent internals are central. |
| `tests/run_agent` | Backward compatibility and direct agent behavior matter. |
| `tests/cron` | Scheduled jobs have dedicated tests. |
| `tests/plugins` | Plugin hooks and integrations are tested. |
| `tests/acp` / `tests/acp_adapter` | Editor/client protocol behavior is tested. |
| `tests/integration`, `tests/e2e`, `tests/stress` | Some whole-system behavior is tested. |
| security-related tests | There are tests for SQL injection, URL/base URL handling, env loading, atomic file replacement, and other hardening cases. |

# Appendix E. CLI Command Family Map

The main CLI is very large, but its command families can be understood like this:

| Command Family | Purpose |
|---|---|
| `model`, `fallback` | Select model and fallback provider behavior. |
| `secrets`, `auth`, `login`, `logout` | Manage credentials and authentication flows. |
| `gateway` | Run, start, stop, restart, install, uninstall, list, setup, and inspect messaging gateway. |
| `proxy`, `portal`, dashboard commands | Start or manage local web interfaces. |
| `setup`, `postinstall`, `doctor`, `status` | Install, validate, and diagnose Hermes. |
| `cron` | List, create, edit, pause, resume, run, remove, and inspect scheduled jobs. |
| `webhook` | Manage webhook endpoints. |
| `kanban` | Manage task board / worker behavior. |
| `hooks` | Manage local hooks. |
| `security audit` | Run security checks. |
| `dump`, `debug`, `backup`, `import` | Diagnostics and data management. |
| `config` | Show, edit, set, migrate, and validate configuration. |
| `skills`, `bundles`, `curator` | Manage skills and skill collections. |
| `plugins` | Manage plugins. |
| `memory` | Inspect or manage memory. |
| `tools`, `computer-use`, `mcp` | Manage toolsets, computer-use features, and MCP servers. |
| `sessions`, `insights` | Inspect and search stored conversations. |
| `update`, `uninstall`, `version` | Maintenance. |
| `acp` | ACP/editor protocol support. |
| `profile` | Manage named profiles/personas/model setups. |

# Appendix F. Recommended Mental Model for Debugging

When debugging Hermes, use this chain:

1. **Interface problem?** Check CLI/TUI/web/gateway/desktop layer first.
2. **Session problem?** Check `hermes_state.py` and session ID mapping.
3. **Config problem?** Check `hermes_cli/config.py`, active profile, env values, and provider keys.
4. **Model problem?** Check provider mode, fallback chain, model compatibility, and streaming behavior.
5. **Tool problem?** Check `toolsets.py`, `model_tools.py`, `tools/registry.py`, and the specific tool file.
6. **Memory/skill problem?** Check memory manager, memory files, skill enablement, and prompt injection scanning.
7. **Gateway problem?** Check platform adapter config, `gateway/session.py`, session key, and delivery logs.
8. **Cron problem?** Check job JSON, schedule parsing, scheduler lock, disabled toolsets, and saved output.
9. **Dashboard problem?** Check FastAPI route, frontend API helper, websocket connection, and browser console.
10. **Plugin problem?** Disable plugins and re-enable one at a time to find the hook or provider causing behavior changes.

