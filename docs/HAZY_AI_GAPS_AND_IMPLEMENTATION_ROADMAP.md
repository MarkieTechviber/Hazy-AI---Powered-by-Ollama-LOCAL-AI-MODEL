# Hazy AI: Product Definition, Gaps, and Implementation Roadmap

Last reviewed: June 7, 2026

## Implementation Status

### Completed in the current foundation update

- Added a migrated SQLite data layer with WAL journaling, foreign keys, indexes,
  and schema versioning.
- Replaced JSON conversation writes with transactional SQLite messages,
  summaries, and scoped durable memories.
- Added conservative typed memory extraction for personal facts, preferences,
  boundaries, and project facts.
- Added memory confidence, sensitivity, status, project scope, timestamps,
  expiry fields, and last-used tracking.
- Added `/hazy/memories` APIs for list, add/update, pause, restore, and delete.
- Added a user-facing Memory tab in Settings.
- Added explicit rejection of passwords, API keys, tokens, private keys, and
  similar credentials from companion memory.
- Added an AES-256-GCM local provider-secret vault and automatic migration out
  of plaintext `hazy-config.json`.
- Removed provider API keys from browser storage and chat request bodies.
- Replaced wildcard CORS with a configurable local Hazy origin.
- Connected the bounded multi-step agent loop to production Agent Mode.
- Added tool-call adapters for Ollama, OpenAI, Groq, NVIDIA, and Anthropic.
- Preserved assistant tool-call history and enforced two-to-eight step budgets.
- Kept deterministic search as the fallback for providers without native agent
  adapters.
- Moved full browser conversation state into SQLite with automatic migration
  from existing `localStorage` chats.
- Disabled browser-side dynamic code execution and routed calculator calls
  through the backend tool gatekeeper.
- Replaced the auto-continue mock response with a real streaming Hazy request.
- Declared Node.js 22.5+ as the canonical backend requirement.
- Added persistence, vault, provider-adapter, and agent regression tests plus
  live browser verification.

### Still in progress

- Add native Gemini tool calling and structured tool-start/tool-result events.
- Persist agent runs and steps in SQLite.
- Add backup/export/recovery and retention controls.
- Add the recurring end-to-end quality evaluation suite.
- Retire the Python fallback or bring it to canonical-runtime parity.

## Executive Summary

The best current description of Hazy is:

> **Hazy is a local-first, companion-oriented AI application powered by interchangeable LLMs, with retrieval, reasoning controls, and partial agentic capabilities.**

That is a good and differentiated product direction. Hazy should not try to be a smaller copy of ChatGPT or Claude. Its strongest identity is:

- local-first privacy
- selectable local or cloud models
- warm companion behavior
- user-controlled personas
- coding and website-building workflows
- extensible tools, retrieval, and reasoning

However, Hazy should not yet be described as a fully autonomous general AI agent. Agent Mode now runs a bounded model-directed loop through the backend gatekeeper, but the live tool ecosystem is still limited mainly to web search and calculation, and it does not pursue persistent background goals.

## What Hazy Is Today

| Category | Current assessment |
|---|---|
| LLM | No. Hazy uses LLMs supplied by Ollama or cloud providers. |
| AI application | Yes. Hazy is the application and orchestration layer around those models. |
| Companion AI | Yes. This is Hazy's primary interaction style and product identity. |
| Agentic AI | Yes, in bounded Agent Mode. Hazy can select limited tools, inspect results, revise, and request confirmation. |
| General AI agent | Not yet. Multi-step execution is live, but the tool ecosystem, durable run state, and integrations remain narrow. |
| Autonomous AI | No. Hazy does not independently pursue open-ended goals or run persistent background work. |

## What Is Already Strong

### 1. Local-first model flexibility

Hazy can use Ollama locally and route to several cloud model providers. This gives users more control over privacy, price, speed, and model quality than a single-provider product.

### 2. Companion identity

Hazy has an explicit companion prompt, emotional and intent routing, tone profiles, safety checks, persona support, and response normalization. This is more deliberate than placing a friendly sentence in a system prompt.

### 3. Useful orchestration foundation

The backend already contains:

- intent, emotion, intensity, and safety detection
- context-window management
- conversation summaries
- user preference memory
- document retrieval
- web search with source processing and citations
- reasoning profiles and answer checks
- a tool registry, gatekeeper, confirmations, rate limits, and audit logs
- a multi-step agent-loop implementation

### 4. Practical creation features

Hazy supports code generation, website generation, file upload, basic vision input, live website preview, downloadable projects, voice output, chat history, and personas.

## Main Gaps Compared With ChatGPT and Claude

The comparison below concerns product capabilities and reliability, not only model intelligence. Raw answer quality still depends heavily on the selected Ollama or cloud model.

| Priority | Gap | Hazy today | Mature product baseline | Implementation update |
|---|---|---|---|---|
| P0 | Main agent loop | Connected for Ollama, OpenAI, Groq, NVIDIA, and Anthropic with bounded steps and the tool gatekeeper. Gemini and structured step streaming remain. | The model can select tools, inspect results, revise its plan, and continue through several steps. | Add Gemini tool calling, persist runs/steps, and stream structured tool events. |
| P0 | Memory control and quality | Typed SQLite memory now has confidence, scope, sensitivity, expiry metadata, and Settings controls. Contradiction resolution and approval policy remain basic. | Users can view, add, remove, disable, and scope memories. Project memory is isolated. | Add contradiction handling, explicit approval modes, salience, and relationship-continuity candidates. |
| P0 | Secure secret storage | Provider keys are encrypted server-side and removed from browser storage/request bodies. | Credentials are encrypted, server-side, access-controlled, and never exposed to frontend scripts. | Add optional OS-keychain wrapping and key rotation/recovery. |
| P0 | Reliable persistence | Conversations, messages, summaries, memory, and provider secrets use migrated SQLite storage. Confirmations and some logs remain file-based. | Transactional storage, migrations, indexing, backup, recovery, and corruption handling. | Move remaining operational state to repositories and add backup, recovery, and retention controls. |
| P0 | Evaluation system | Unit tests cover modules, but there is no recurring end-to-end quality benchmark. | Automated regression suites measure factuality, tool success, safety, latency, memory precision, and task completion. | Add a versioned eval dataset, model matrix, scored traces, golden answers, and CI quality gates. |
| P0 | Python backend parity | Python fallback is mostly an Ollama proxy and bypasses the companion, memory, RAG, reasoning, and agent pipeline. | All supported launch paths provide the same product behavior. | Either remove the fallback from supported claims or make Python call the same service modules through one canonical API. |
| P1 | Projects/workspaces | Chats and uploaded files are not organized into durable, isolated project workspaces. | Projects combine chats, files, instructions, knowledge, and project-specific memory. | Add `projects`, `project_members`, `project_files`, `project_instructions`, and project-scoped retrieval and memory. |
| P1 | Deep research | Web search can gather and rerank evidence, but it is generally a single pre-generation search run. | Multi-query research iterates, reads sources, resolves conflicts, fills evidence gaps, and produces a cited report. | Build a research state machine with query expansion, source coverage checks, follow-up searches, synthesis, and report export. |
| P1 | Real embeddings/vector retrieval | `embeddingService.js` currently tokenizes text; retrieval is lexical/hybrid rather than semantic embedding search. | Semantic embeddings, scalable vector indexing, metadata filtering, reranking, and document lifecycle management. | Add a local embedding provider, SQLite vector extension or Qdrant, embedding cache, reindex jobs, and deletion support. |
| P1 | Secure code and data execution | Browser dynamic execution is disabled; Hazy has no general code sandbox yet. | Isolated Python/code execution supports data analysis, charts, generated files, limits, and safe cleanup. | Add a separate sandbox worker using containers or an OS-isolated process with CPU, memory, filesystem, network, and timeout policies. |
| P1 | Artifact/canvas editing | Website preview and file tabs exist, but editing is generation-oriented and lacks robust versioned targeted edits. | Users directly edit documents/code, select regions, request inline changes, compare versions, and restore history. | Create an artifact model with versions, editable text/code, patch operations, diff view, autosave, and restore. |
| P1 | Integrations and actions | Backend tools are currently limited mainly to web search and calculator. | Connected services can retrieve data and perform permissioned actions. | Add an integration SDK and OAuth flow for files, email, calendar, GitHub, and user-defined HTTP/MCP tools. |
| P1 | Proactive and scheduled work | Hazy responds only while the user is interacting. | One-time and recurring tasks can run later and notify the user. | Add a local scheduler, persisted jobs, retry policy, background worker, notification center, and explicit action permissions. |
| P1 | Multimodal voice conversation | Hazy has TTS and some voice-input hooks, but not a unified low-latency duplex voice experience. | Natural interruptible voice conversation with speech recognition, turn detection, and multimodal context. | Add streaming speech-to-text, voice activity detection, interruption handling, audio queues, and conversation-state synchronization. |
| P1 | File understanding | Browser extraction is capped and format support is limited. PDF handling primarily extracts text. | Robust parsing for large PDFs, tables, spreadsheets, presentations, images, and scanned documents. | Move ingestion server-side, add OCR, spreadsheet and presentation parsers, table extraction, background indexing, and upload status. |
| P2 | Model routing quality | Users select models and some reasoning metadata is normalized, but routing is not benchmark-driven. | The system chooses models based on task, quality, latency, modality, context size, and cost. | Add a capability registry, health checks, per-task benchmarks, fallback chains, and routing telemetry. |
| P2 | Response review enforcement | The reviewer analyzes completed output, but streamed text has already reached the user and revisions are not applied to the provider stream. | Safety and quality policies are enforced before or during delivery with structured regeneration when needed. | Buffer high-risk turns, run a reviewer model or policy engine, regenerate failed responses, and expose only approved output. |
| P2 | Companion memory depth | Hazy remembers limited style hints but does not reliably extract important personal facts, boundaries, relationship history, or unresolved topics. | Personalization is durable, controllable, context-aware, and avoids creepy or incorrect recall. | Add explicit memory candidates, user approval options, salience scoring, contradiction resolution, decay, and boundary-sensitive categories. |
| P2 | Collaboration and sync | Hazy is mainly single-device and browser-local. | Users can continue across devices and optionally collaborate in shared workspaces. | Add optional authenticated sync, encrypted backups, conflict handling, and export/import bundles while retaining local-only mode. |
| P2 | Observability | Usage logs, traces, and audit events exist, but there is no unified operational dashboard. | Operators can inspect latency, failures, token use, tool success, retrieval quality, and model/provider health. | Add structured event IDs, OpenTelemetry-compatible traces, dashboards, error grouping, and privacy-aware diagnostics export. |
| P2 | Accessibility and polished clients | Responsive web UI exists, but there is no full accessibility audit or native mobile/desktop product. | Keyboard, screen-reader, contrast, mobile, desktop, and offline behavior are systematically tested. | Add WCAG tests, focus management, semantic labels, reduced motion, installable PWA support, and later native wrappers if justified. |

## Important Architectural Issues

### Agentic capability is connected but still narrow

`backend/agent/runAgentTurn.js` now powers production Agent Mode through provider adapters and the mandatory gatekeeper. Ordinary non-agent chat still uses deterministic search as a fast path.

This means Hazy is now a **bounded agentic AI application**, but not a broad autonomous agent. It currently exposes only a small trusted tool set and does not persist complete run/step state.

Remaining update:

1. Add native Gemini tool calling.
2. Persist agent runs, steps, usage, and final status.
3. Stream tool-start, tool-result, confirmation, and final-answer events.
4. Add cancellation and idempotency for future write tools.
5. Expand tools only after permission and integration contracts are complete.

### Memory is controllable, but not yet fully mature

Current memory uses typed SQLite records with confidence, scope, sensitivity, expiry metadata, and user controls. It still needs contradiction resolution, approval modes, and stronger salience/decay logic.

Recommended memory types:

- explicit user facts
- preferences
- boundaries and dislikes
- ongoing goals
- project facts
- unresolved conversation threads
- relationship continuity notes

Each memory should include:

- unique ID
- user and project scope
- source conversation
- creation and last-used timestamps
- confidence
- sensitivity class
- expiry or decay policy
- user-visible edit/delete controls

### Retrieval is not truly semantic yet

The current embedding service creates token sets rather than neural embeddings. This is useful lexical retrieval, but it will miss paraphrases and conceptually related passages.

Recommended local-first stack:

- embedding model through Ollama or ONNX
- SQLite for metadata
- `sqlite-vec`, LanceDB, or Qdrant for vectors
- hybrid BM25/vector retrieval
- cross-encoder or LLM reranking for high-value tasks

### Security needs tightening before adding powerful actions

The agent gatekeeper, encrypted vault, local-origin CORS, and disabled browser execution are good foundations. The surrounding application still needs:

- authentication if bound beyond localhost
- CSRF protection for browser actions
- strict content security policy
- secure sandboxing
- tool-specific permission grants
- data retention and deletion controls

Do not add file deletion, shell execution, email sending, purchases, or deployment tools until these controls are enforced end to end.

## Recommended Implementation Order

### Phase 1: Make the foundation trustworthy

Target: 2-4 weeks

- Replace JSON persistence with SQLite.
- Add schema migrations and backup/export.
- Move API keys out of browser storage.
- Restrict CORS to the Hazy origin.
- Add user-visible memory controls.
- Declare Node as the canonical backend or achieve Python feature parity.
- Add end-to-end tests for chat, memory, search, citations, and provider streaming.

Completion criteria:

- restart does not lose or corrupt state
- users can inspect and delete memories
- provider secrets never appear in browser storage
- every supported launcher produces the same companion behavior

### Phase 2: Connect the real agent runtime

Target: 3-6 weeks

- Add provider-neutral model adapters with tool calling.
- Connect `runAgentTurn()` to the main chat endpoint.
- Persist agent runs, steps, results, and confirmations.
- Add structured streaming events.
- Add tool budgets, cancellation, retries, and idempotency.
- Keep the current gatekeeper as the mandatory execution boundary.

Completion criteria:

- Hazy can complete a two-to-five-step task using multiple tools
- users see what action is being requested
- risky actions require exact confirmation
- repeated requests do not accidentally repeat side effects

### Phase 3: Build projects and semantic knowledge

Target: 4-8 weeks

- Add project workspaces.
- Scope chats, files, instructions, memory, and retrieval by project.
- Add real local embeddings and hybrid retrieval.
- Move file ingestion to background jobs.
- Add OCR and structured document parsers.
- Add source and citation inspection.

Completion criteria:

- project A cannot leak memory or files into project B
- large knowledge collections remain searchable
- deleting a file removes its chunks and vectors
- cited answers link back to exact source locations

### Phase 4: Add secure creation and analysis tools

Target: 4-8 weeks

- Build an isolated execution service.
- Support Python data analysis and chart generation.
- Add artifact versions, direct editing, patches, diffs, and restore.
- Let generated files become durable project artifacts.
- Add export for Markdown, code bundles, CSV, charts, and reports.

Completion criteria:

- code execution cannot read arbitrary host files
- CPU, memory, time, and network limits are enforced
- users can edit and restore generated artifacts without regenerating everything

### Phase 5: Integrations and proactive companion features

Target: ongoing

- Add an integration/plugin SDK.
- Add OAuth-backed connectors.
- Add scheduled and recurring tasks.
- Add local notifications.
- Add streaming speech recognition and interruptible voice.
- Add optional encrypted cross-device sync.

Completion criteria:

- every integration has explicit scopes
- every write action is audited
- scheduled jobs survive restart
- local-only use remains fully supported

## Evaluation Plan

Hazy should maintain a versioned test set in these categories:

| Category | Example metrics |
|---|---|
| Companion quality | emotional fit, non-mechanical language, continuity, appropriate questions, independence without hostility |
| Memory | precision, recall, contradiction rate, sensitive-memory rate, correct project scoping |
| Agent tasks | completion rate, tool-call accuracy, unnecessary tool calls, confirmation compliance |
| Research | citation correctness, source quality, coverage, freshness, unsupported-claim rate |
| Coding | build success, test pass rate, placeholder rate, security defects |
| Safety | crisis handling, dependency language, prompt injection resistance, secret leakage |
| Performance | first-token latency, total latency, tokens, memory use, provider failure recovery |

Run the evaluation matrix against:

- at least one small local model
- one strong local model
- each supported cloud provider
- Agent Mode on and off
- memory on and off
- project-scoped and ordinary chats

## Recommended Product Positioning

Use this short description:

> **Hazy is a private, local-first AI companion and workspace that can chat, remember, research, build, and use permissioned tools through local or cloud language models.**

Until the broader tool ecosystem, durable runs, and integrations are complete, use this technical description:

> **A local-first companion-oriented AI application with bounded agentic capabilities.**

After the agent runtime, integrations, durable projects, and safe action system are complete, this description becomes accurate:

> **A local-first companion-style agentic AI platform powered by interchangeable LLMs.**

## What Not to Copy

Hazy does not need every feature from ChatGPT or Claude.

Avoid:

- cloud dependence as the default
- opaque memory users cannot control
- adding many weak tools before a few reliable ones
- pretending a small local model matches frontier-model intelligence
- unsafe computer control marketed as autonomy
- companion language that encourages emotional dependency

Keep Hazy's differentiation:

- local ownership
- transparent model choice
- explicit permissions
- warm but honest companionship
- user-visible memory and data controls
- extensible, inspectable agent behavior

## Current External Capability Baseline

This comparison used official product documentation available on June 7, 2026:

- [ChatGPT Capabilities Overview](https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview)
- [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
- [Canvas in ChatGPT](https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it)
- [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)
- [Claude product overview](https://www.anthropic.com/product)
- [Claude Projects](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Claude Artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Claude Integrations](https://support.anthropic.com/en/articles/10168395-setting-up-claude-integrations)
