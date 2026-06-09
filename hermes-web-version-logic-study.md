# Hermes Agent — Web Version (Dashboard) Logic Study
**Focus**: The browser-based web/dashboard ("web version") only.  
**Snapshot**: hermes-agent-2026.6.5  
**Purpose for Hazy AI**: Understand the *logic, architecture, data flows, design decisions, and UX patterns* so they can inspire improvements to Hazy while **strictly preserving Hazy's identity** (vanilla/local-first stack, chat as the single surface for everything including web research + citations, no separate "browser automation" or detached panels).

**CRITICAL RULE (user requirement)**:  
**DO NOT COPY CODE FROM HERMES INTO HAZY.**  
This document describes logic, "why", flows, and abstractions in plain English + high-level patterns. Any later adaptation into Hazy must be re-implemented in Hazy's own code style (current `frontend/app.js` + CSS + Node/Python backends + existing `webSearchTool` + citation pipeline). The goal is *inspiration and understanding*, never verbatim or drop-in ports. All recommendations below explicitly reinforce: web research, search, and citations must live **inside the chat transcript** as first-class parts of the conversation.

This study builds on (and deltas from) the existing broad `hermes-agent-source-code-study.md` in the same directory. It does **not** re-cover core agent runtime, full skills implementation, gateway platforms, etc.

---

## 1. What the "Web Version" Actually Is (High-Level Logic)

Hermes has many surfaces (CLI TUI, gateway messaging platforms, desktop shell). The **web version** is the **browser dashboard** — a management + chat UI served by a small FastAPI backend (`hermes_cli/web_server.py`).

**Core idea**: The dashboard is *not* a second full reimplementation of the agent chat. It is "chrome + rich live views + management" wrapped around the *real* existing TUI/agent logic via a bridge. This gives:
- Pixel-perfect chat fidelity (the actual TUI runs).
- Structured, inspectable, live side information (tools, reasoning, status) that is hard to get cleanly from raw terminal output.
- Full configuration, skills, plugins, models, sessions, etc. management without leaving the browser.
- All while staying local-first (localhost CORS, process-lifetime tokens, no general public exposure by default).

**Why this matters for Hazy** (logic translation only):
Hazy already decided "web search / research / ideas / citations happen **only inside chat**" (no separate browser panel). The valuable logic from Hermes is *how to make the inside-chat experience richer and more observable* (live tool visibility, structured events, timing, previews, sources) without ever splitting the user's attention into a separate surface. The dashboard chrome (models picker, config, plugins) can be inspiration for *non-intrusive* additions that still keep research inside the conversation transcript.

---

## 2. Overall Architecture (Text Diagrams)

### 2.1 The Chat Surface — Dual-Path "Fidelity + Observability"

```
Browser tab (/chat)
├── Main pane (persistent host in App.tsx)
│   └── xterm.js Terminal (WebGL + fit + unicode + links)
│       onData (keystrokes) ──► PTY WS (/api/pty?token|ticket&channel=...&resume=...)
│       write(bytes) ◄── PTY output (ANSI/VT100)
│
└── Sidebar (ChatSidebar, always mounted or portaled on mobile)
    ├── Model badge + picker (via GatewayClient JSON-RPC /api/ws)
    ├── Connection state / errors
    └── Tools "transcript" list (ToolCall components)
        ◄── events WS (/api/events?channel=...)   [passive subscriber]
```

**The channel** (client-generated UUID per mount) is the correlation key. Both the raw PTY pipe and the structured events pipe carry it. Server fans structured events out by channel.

**Why dual paths?**  
- Raw PTY bytes must stay byte-exact and faithful to the real TUI (no parsing, no mutation). This is the "what the agent actually said/did" transcript.
- Structured events (`tool.start` / `progress` / `complete`, `reasoning.*`, `message.*`, approvals, etc.) give rich, typed, time-aware, collapsible UI (previews while running, diffs, errors auto-expanded, elapsed timers) that would be ugly or lossy to extract from the raw terminal stream.

**Hazy logic adaptation (vanilla, chat-only)**:  
Your single transcript (the conversation history in app.js) is the source of truth. Research steps and citations (from your existing webSearchTool + citation pipeline) can be emitted as "events" (even if just custom events or direct DOM updates from the streaming response). Render them *inline or as attached expandable cards/footnotes inside the assistant message bubble* so they become permanent, citable, copyable parts of the chat record the user is already reading. No separate panel. A lightweight side tray or "details" section *still inside the transcript scroll* can show live structured updates if desired. The "channel" idea becomes a simple `chatId` or `turnId` on your streaming messages.

### 2.2 Serving + Auth Logic (Local Dashboard, Zero Config, Secure by Default)

```
hermes dashboard (or python -m ... web)
└── FastAPI (web_server.py)
    ├── lifespan → app.state.event_channels + event_lock (in-process pubsub)
    ├── CORS (localhost/127 only)
    ├── Host header check (anti DNS-rebinding)
    ├── Dual auth path (decided at bind time):
    │   ├── loopback/--insecure: legacy rotating _SESSION_TOKEN (secrets or env)
    │   │   injected into served index.html as window.__HERMES_SESSION_TOKEN__
    │   │   + X-Hermes-Session-Token header on REST; ?token= or ticket on WS
    │   └── gated (public bind): cookie-based OAuth/password (dashboard_auth/*)
    │       + /api/auth/ws-ticket (cookie-authed → single-use 30s ticket for browser WS)
    │       + internal multi-use credential (env only, for server-spawned children)
    ├── Static SPA mount + _serve_index (rewrites for X-Forwarded-Prefix)
    │   └── injects <script> window.__...TOKEN__ , __BASE_PATH__ , __AUTH_REQUIRED__ ...
    ├── /api/pty  (PTY WS bridge → spawns real TUI child via pty_bridge)
    ├── /api/ws   (JSON-RPC gateway sidecar, same dialect as stdio TUI)
    ├── /api/pub  (publisher from PTY child / tui_gateway)
    ├── /api/events (subscriber fan-out by channel — sidebar, future UIs)
    └── management REST (/api/status, /api/config + schema, /api/env, /api/model/*, /dashboard-plugins/*, etc.)
```

**Key "why" decisions**:
- Injected secret (never fetched via API, dies with process) + header for the common local case.
- Single-use short-TTL tickets for browser WS upgrades (because browsers can't set custom headers on upgrade) vs stable internal credential for trusted children.
- Everything is best-effort and scoped (channel, public_paths allowlist, localhost CORS).
- The real agent/TUI child is spawned behind the PTY; the browser is just a fancy remote control + rich observer.

**Hazy logic adaptation (local vanilla)**:  
If you ever serve a richer local UI from the companion (even just enhanced chat), you can do a tiny per-run secret (or rely on "same origin = trusted" for pure localhost file+worker setups) and inject it at serve time. For any WebSocket path used by the chat surface, do the equivalent of the ticket dance only if you need stronger guarantees. Keep the entire surface (including any live research/citation cards) strictly local and chat-internal. No need for the full OAuth machinery unless you want to expose something.

### 2.3 Event Model (Standardized, Typed, Extensible, Transport-Agnostic)

The `tui_gateway` (and its WS transport) re-uses the *exact same* newline-delimited JSON-RPC dispatcher that the Ink TUI uses over stdio.

Common events (GatewayEventName):
- `message.start/delta/complete`
- `thinking.delta`, `reasoning.delta` / `reasoning.available`
- `tool.start` (id, name, context), `tool.progress` (preview), `tool.complete` (summary, error, inline_diff), `tool.generating`
- `status.update`, `clarify.request`, `approval.request`, `secret.request`, `sudo.request`, `background.complete`, `error`, `gateway.ready`, `session.info`, etc.

Producers (agent loop, tools, etc.) emit once. Multiple consumers (TUI renderer, web sidebar, future plugins) subscribe by type. The transport (stdio vs WS) is just a detail.

**Hazy logic adaptation**:  
Define a small, stable set of event shapes that your chat streaming + webSearch pipeline can emit (`citation.start` with source/relevance, `citation.complete` with summary + url, `web.research.step`, `tool.start` etc. for any local tools). Your transcript builder (or a tiny event bus) folds them directly into the message DOM as they arrive (live updating sources list inside the bubble, expandable research cards, status badges). Because it's the same stream that produces the final answer text, everything naturally ends up as part of the permanent chat history with citations. This is exactly how Hermes makes tools observable without a separate log.

---

## 3. Key Reusable Logic Patterns (with Hazy Notes)

(These are the high-value ideas extracted across the reads. All are described at the logic level.)

1. **Fidelity via embedding the real engine + orthogonal structured side channel** (ChatPage + ChatSidebar + channel + dual WS).  
   The "chat" view mirrors the authoritative engine exactly (PTY bytes). A completely separate, best-effort channel carries rich metadata for UI affordances.  
   *Hazy*: Keep your transcript as the single source of truth (the conversation the user reads). Use your existing webSearch + any tool streaming to emit structured side data that renders *inside or attached to* the transcript (citation cards, live research steps, tool results with timing). The side data becomes part of history, not a separate view.

2. **Correlation key (channel / turn id) for independent subscribers without tight coupling**.  
   Client generates an opaque id per "chat instance". Both pipes carry it. Server fans out by id. Refresh or fork → new id.  
   *Hazy*: A `turnId` or `researchId` on your streaming responses + citation events. The renderer for the current assistant message listens for matching events and mutates/inserts nodes inside that message's container (or appends a sources section that becomes immutable on complete).

3. **Event lifecycle for opaque/long-running actions (start + progress + complete + timing + auto-surface errors)**.  
   Small vocabulary + client-side derived state (elapsed timer only while running, auto-expand on error, collapsible body with preview → final summary/diff).  
   *Hazy*: Treat citations and research steps the same way. A "citation" or "web research" event has the same lifecycle. The card shows live snippets while the model is still "thinking", then locks in the final cited sources with links. Timing and status live in the transcript.

4. **Injected ephemeral secret + HTML bootstrap + graceful dual-mode auth for local-first zero-config surfaces**.  
   Server mints/injects a token into the initial HTML it serves. SPA reads it for headers. Dev server has a clever plugin to scrape it from the real server HTML. Gated mode uses cookies + mints short WS tickets on demand.  
   *Hazy*: For any local web surface the companion serves, inject a per-run token (or just trust same-origin) at serve time. Use it for any back-calls from the chat UI. If you add WS for live research updates, the ticket pattern is a nice way to bridge cookie-style local auth to WS.

5. **Bridge to existing CLI/TUI instead of reimplementing (PTY + sidecar env injection)**.  
   Spawn the real battle-tested TUI behind a PTY; the web part is "just" xterm + event observer. Sidecar URL in env tells the child how to publish structured events without changing its stdio contract.  
   *Hazy*: You already have a working chat loop + webSearch. The "bridge" idea is to keep the authoritative research/citation logic in one place (your current tool + streaming code) and have the UI (current app.js transcript) be a faithful mirror + rich visualizer. Any live output (tool execution, web fetch previews) can be streamed as events that the transcript consumes.

6. **Extensibility via slots + manifests without forking core (plugins system)**.  
   UI slots (`chat:top`, `chat:bottom`, page-level) + served plugin scripts + manifest registration.  
   *Hazy*: If you later want to let users or future code add custom citation visualizers, research step renderers, or tool cards without editing the core transcript code, a simple registry + slot concept (even vanilla: a map of renderers called at specific points in message rendering) is the logic to copy.

7. **Strict, portable typography/contrast/legibility rules** (web/README).  
   Minimum sizes, opacity floors (never <0.7 on text), semantic tokens over raw layers, brand chrome via specific classes only, technical content in mono, etc.  
   *Hazy*: Directly applicable to your CSS. Adopt the floors and semantic naming even in vanilla classes (e.g. `.text-primary`, `.text-secondary`, `.mono-ui`). It makes long transcripts with citations and tool details much more readable across themes.

---

## 4. Management Surfaces (High-Level Logic)

Pages like SkillsPage, McpPage, PluginsPage, ModelsPage, ConfigPage, EnvPage, SessionsPage etc. are typical "admin" UIs:
- Cards / lists / switches / badges (from the shared DS).
- Backed by typed api calls (status, schema-driven config editor, redacted env, skill hub results, plugin discovery, etc.).
- Live or on-demand refresh.
- Theme and i18n applied consistently.

**Hazy mapping (logic only)**:  
If Hazy grows first-class concepts for "skills", "plugins", "MCP connectors", or advanced model config, expose them via small, focused surfaces (a settings drawer, a models picker in the composer, a "research sources" manager) that are reachable from chat but do not pull the user out of the conversation flow. The research/citation results from webSearch should still appear inside the chat transcript even if the user configures sources elsewhere.

---

## 5. Prioritized Recommendations for Hazy (Logic-Level Only, Chat-Only Research)

**Low effort, high value (do these first)**:
- Enhance the existing transcript rendering in `app.js` with structured "action/citation cards" that appear inline or as attached expandable sections inside assistant messages. Use timing, status (running/done/error), preview snippets (while the model or webSearch is working), and final summaries/links. Make errors auto-visible. This directly gives the "ToolCall" observability benefit without any architecture change.
- Standardize a tiny event shape for your webSearch + tool results (start with id/name/context, progress with preview, complete with summary + citations + error). Drive the cards from the same streaming path you already have.
- Add a lightweight "sources / research log" tray or footnotes section that lives inside the current chat scroll (collapsible per turn or global). Everything stays in one place.

**Medium**:
- If you want live terminal-style tool output (shell commands, fetch logs, etc.) visible while they run, consider adding xterm.js (or a simpler scrolling pre) as an *optional pane or tab inside the chat transcript area*, not a separate workspace. Stream from your existing tool executor.
- Adopt a simple "per-chat-instance id" + event bus (or just the existing message streaming) so multiple visual pieces (main transcript, sources tray, status strip) can react to the same research steps without tight coupling.
- If you ever serve the Hazy UI from a small companion server (instead of pure static), use the injected-secret + header pattern for any back-calls. It's simple and local-friendly.

**Higher effort / only if it fits future direction**:
- A plugin/slot style registry so citation visualizers, custom research step renderers, or tool cards can be added without editing core transcript code.
- Themed, strict typography rules applied consistently (min sizes, semantic tokens, opacity floors) — this will make long research-heavy conversations much more pleasant.
- Management surfaces (models, config, "research profiles", saved citation sets) as non-modal drawers or a settings section that still feel like part of the chat companion rather than a separate app.

**Explicitly do not**:
- Re-create a separate "Browser" or "Automation" workspace/page.
- Move web research or citation display out of the main chat transcript.
- Adopt the full PTY + child TUI embed unless you have a strong reason (Hazy's current streaming + webSearch is already the authoritative path; the value is richer *visualization* of it inside chat).
- Copy any React/DS code or build setup unless you deliberately decide to add a build step to Hazy (the plan and this study assume you want to stay close to the current vanilla approach).

---

## 6. File References (for further reading in the Hermes tree)

**Web frontend (logic sources)**:
- `web/src/App.tsx` (persistent chat host, routing, plugin slots, isActive)
- `web/src/pages/ChatPage.tsx` (xterm setup, PTY WS, channel, resume, buildWsUrl, cleanup)
- `web/src/components/ChatSidebar.tsx` (GatewayClient + events WS subscriber, tools state, channel correlation)
- `web/src/components/ToolCall.tsx` (lifecycle rendering, auto-expand on error, elapsed, preview/diff/summary)
- `web/src/lib/api.ts` (HERMES_BASE_PATH, fetchJSON + token header, 401 handling + reload guard, getWsTicket, buildWsAuthParam)
- `web/src/lib/gatewayClient.ts` (JSON-RPC + typed GatewayEventName union: tool.*, message.*, reasoning.*, etc.)
- `web/README.md` (typography rules, dev vs prod serving, structure)
- `web/vite.config.ts` (hermesDevToken plugin that scrapes the real server HTML for the token in dev)
- `web/src/plugins/*` (slots, registry, usePlugins — extensibility logic)

**Web server (logic sources)**:
- `hermes_cli/web_server.py` (full — _lifespan + event_channels pubsub, _SESSION_TOKEN + _serve_index injection, host_header_middleware, _dashboard_auth_gate + legacy auth_middleware, pty_ws + PtyBridge spawn + pumps, /api/ws, /api/pub, /api/events, /api/auth/ws-ticket, public_paths, config/env/status/plugin routes, _ws_auth_ok + ticket vs internal cred)
- `hermes_cli/dashboard_auth/` (middleware.py, public_paths.py, ws_tickets.py, routes.py for /auth/* + ws-ticket, cookies, base providers, prefix.py)
- `hermes_cli/pty_bridge.py` (PtyBridge spawn/read/write/resize/close)

**Supporting (to understand the bridge)**:
- `tui_gateway/ws.py` + `server.py` (re-uses the exact stdio JSON-RPC dispatcher over WS)
- `ui-tui/` (the real TUI being PTY'd — entry, gatewayClient, turnController, etc.)
- Various pages (SkillsPage.tsx etc.) for management UI patterns.

**Cross reference**: See the existing `hermes-agent-source-code-study.md` for the non-web parts (agent loop, tools, memory, gateway platforms, skills creation, etc.).

---

## 7. Final Notes

- The Hermes web version's power comes from **separation with correlation** (raw fidelity + structured observability) + **embedding instead of reimplementation** + **local-first security patterns that are still ergonomic**.
- For Hazy the highest-leverage translations are almost all about making the *inside-chat* experience for research, tools, and citations more visible, timed, previewable, and citable — without ever leaving the conversation the user is having.
- Every pattern above has been described so it can be re-expressed in vanilla DOM + your current streaming + webSearch pipeline.

If you want to go deeper on any specific logic area, want the MD adjusted, or want to discuss concrete next steps for a particular adaptation (e.g. "add live citation cards to the transcript using the existing webSearch events"), just say the word.

All exploration was read-only. No Hermes code was copied into Hazy or this document beyond fair-use short descriptions for study purposes. The focus remained exclusively on the web version as requested.