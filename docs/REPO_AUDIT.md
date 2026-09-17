# Repository audit

Audit baseline: `9f1e39c` (12 reachable commits), September 2026. This report is based on the current source, not the older `AUDIT_FOR_STUDY.md`. Findings below describe the baseline; remediation and final verification are recorded separately as work proceeds. This is a code review and reproducible test pass, not a penetration-test certification.

## Scope and architecture found

The tracked tree contains 267 entries. The main application is vanilla HTML/CSS/JavaScript served by `backend/server.js`, a compatibility entry point for `backend/src/infrastructure/web/server.js`. This Node HTTP server implements chat, optional cloud adapters, memory/conversation APIs, RAG, model management, browser tools and a Kokoro speech proxy. Node's built-in SQLite stores conversations and memory; RAG uses a local JSON index. Provider secrets use AES-256-GCM with a separate local master key.

`backend/server.py` is a smaller FastAPI proxy with static serving, persona/title helpers, output writing and TTS. It does **not** implement the Node memory/RAG/agent APIs. Windows launchers and the controller selected Python while `start.sh` preferred Node. Node is the full-feature canonical runtime; Python is retained as a compatibility proxy. `kokoro_server.py` is an optional Python speech service. `backend/production/` wraps an experimental Express/Postgres/Redis implementation, not the default local deployment.

Verified chat flow: deterministic intent/emotion/safety analysis → SQLite memory → hybrid JSON-index RAG → tool/project context → reasoning profile → prompt builder → context packing → provider routing → stream collection → response review and persistence. The orchestrator **already instantiates `OllamaEmbeddingService` and passes memory and RAG to both prompt construction and packing**. Reinstating this wiring would be an obsolete fix. Retrieval failures and duplicate injection still require correction.

Reviewed: application orchestrators; memory manager/extractor/provider orchestration; ingestion/chunking/embeddings/vector search/citations; prompt builder/context packer/model router/providers; agent runtime/budget/confirmation/audit/gatekeeper/file tools; browser session/actions/safety/events; search fetching/providers/stores; vault/database/HTTP boundaries; both server variants; launch/controller scripts; frontend chat/RAG/agent/voice integration and Kokoro. Binary archives were inventoried and scanned without publishing their contents. No model-quality or GPU benchmark is implied.

## Baseline tests (before this pass's edits)

Tests ran in a temporary copy so existing tests could not mutate the user's live cache or database. `npm ci` succeeded (2 installed packages, audit reported zero vulnerabilities). Host: Windows, Node 24.14.0; Python controller tested on 3.11. Node 22 verification is a separate target.

* `npm test` did not finish: synchronous context-packing loop. A bounded per-file runner then ran every existing `backend/tests/*.test.js` file, retaining the original code and assertions.
* 128 Node tests passed, 5 failed, 0 skipped among completed files. `contextPacker.test.js` timed out after 15 seconds; its five tests are not counted as passes or skips.
* Failures: `agentOrchestration` (unknown-tool error contract, confirmation persistence race, boxed-string agent mode), `codeIntelligence` (missing edit/project metadata), `ragPipeline` (retrieved context not labeled/escaped as untrusted).
* `python -m unittest discover -s tests -v`: initially could not import `psutil`; after installing controller requirements, all 8 tests passed, 0 skipped.
* `node test-verify-structured-cards.js`: 9/9 assertions passed. This is a source/string check, not a real browser interaction test.
* `node backend/empathy/testLogic.js`: exited successfully; diagnostic examples, not an assertion-based suite.

Normal Node tests use stubs for browser/search/provider/Postgres/Redis. Two TTS tests execute the `python` command with stdlib-only scripts. Real Ollama generation/embeddings, Chromium navigation, speech generation, GUI controller interaction, cloud APIs and real Postgres/Redis require separate integration checks. No large models were downloaded for baseline tests.

Work resumed with uncommitted edits in 17 files. These changes are preserved and reviewed; the baseline above comes from the untouched original snapshot. Two existing assertion changes are explicit contract updates: unknown/disabled tools share `TOOL_UNAVAILABLE`, and browser click/type now require confirmation. Neither change removes a test.

## Findings

| ID | Severity | Finding and impact |
| --- | --- | --- |
| S01 | CRITICAL | Browser schemas accept model-controlled `confirmed`; actions trust it. A model can self-authorize sensitive input or a purchase click. |
| S02 | HIGH | Python proxy and Kokoro bind all interfaces; Python accepts wildcard CORS. Node CORS sets response headers but does not reject hostile origins or Host headers. These unauthenticated local services must not be exposed to LAN/internet. |
| S03 | HIGH | Artifact paths check lexical containment but symlink checks occur after writes or trust a symlinked base. File reads can reach sensitive files via aliases; deny rules miss root `.git` and config paths. |
| S04 | HIGH | Browser checks only the requested URL, not page subrequests/redirects or DNS. Search private-IP checks miss ranges/mapped IPv6 and resolve again during fetch (DNS rebinding). |
| S05 | HIGH | Confirmation persistence is asynchronous and shares a temporary name. Decisions can race/reappear after restart; approved records can be replayed by repeated resolution. |
| S06 | HIGH | RAG replacement keys use global file/chunk IDs, allowing one user's ingestion to replace another's data. Project scoping and summary ownership are incomplete; agent memory prefetch crosses conversations. Caller-supplied IDs are scopes, not authentication. |
| S07 | HIGH | Tracked cache includes memory, RAG, browser records/screenshots and usage history. Archives may retain older runtime data. Ignoring these files alone does not untrack or erase history. |
| S08 | HIGH | Context tool truncation can loop forever; emergency packing can discard system policy or remain over budget for a large last message. Memory/RAG are duplicated in the system prompt and packing slots. |
| S09 | MEDIUM | Audit redaction only recognizes secret-like keys; file contents, prompts, values and search queries can be persisted. Browser/search stores also hold sensitive local activity by design. |
| S10 | MEDIUM | Malformed JSON becomes `{}`; body limits are large, counted as characters, and proxy bodies bypass the common reader. Some handlers expose exception details. |
| S11 | MEDIUM | Embedding failures trigger lexical ingestion followed by another embedding attempt that can fail the upload. No bounded embedding cache/cooldown; retrieval errors can escape fallback. Upload filenames may cause local file reads during hashing. |
| S12 | MEDIUM | Guardrail exceptions fail open; schema validation lacks a recursive forbidden-key/depth boundary. Iteration grace accepts unbounded/nonfinite values, and deadlines only check between model calls. |
| S13 | MEDIUM | Vault creation is not exclusive; invalid configured keys silently fall back to another key. SQLite itself is plaintext; encryption protects provider secrets only. |
| R01 | HIGH | Windows startup selects a backend missing core APIs. Launch scripts install heavy TTS dependencies automatically and can replace a venv; frontend falls back to direct Ollama and masks loss of agent/memory features. |
| R02 | MEDIUM | Legacy `ai/tools/filesystem` and `terminal` plugins have invalid relative imports and export instances while the registry expects classes; terminal/write implementations are placeholders returning success. Main `backend/tools` registry is separate. |
| R03 | MEDIUM | Experimental production server dependencies resolve outside `production/node_modules`; mock-only tests do not establish deployability. No verified feature parity, authentication or deployment hardening. |
| R04 | MEDIUM | Frontend is large and uses third-party CDN assets. Local inference is available, but fully offline first load is not established. Generated previews and all HTML insertion boundaries need continued scrutiny. |
| R05 | MEDIUM | Response review runs after streamed bytes have been delivered; it cannot retract already displayed output. Several async finalizers are not awaited/caught. |
| R06 | LOW | No root README/license/contributor/security/release guides or CI. Package metadata declares MIT; a license file is missing. |
| R07 | LOW | Backups, code snapshots, ZIPs and document-generation outputs clutter source discovery; incomplete `kokoro` gitlink has no `.gitmodules`. |
| R08 | OPTIONAL | Split large HTTP/frontend modules gradually; add real-browser smoke coverage, model-specific tokenizers and larger-index storage only with evidence and compatibility tests. |

## Strengths worth preserving

Local inference without cloud credentials; SQLite migrations and parameterized SQL; authenticated encryption of provider secrets; deterministic empathy/reasoning helpers; hybrid lexical/semantic RAG with citation metadata; bounded tool schemas, roles and rate limits; per-chat confirmations and typed high-risk phrases; agent iteration accounting; browser sessions separate from the user's personal browser; an existing broad offline test suite; a functioning vanilla companion UI and optional TTS.

## Repository hygiene classification

`cache/` and `hazy_outputs/` are runtime output, not fixtures. `backup/` and `frontend/index-backup.html` are historical source copies. `backend/agent/agent.zip`, other source ZIPs and `prompt dump/*.zip` are snapshots, not runtime dependencies. `prompt dump/*.md`, `docx/*.md`, report generators and reports are historical development material; useful notes should be preserved under documentation, while private/binary snapshots should leave the index without deleting local copies. Nothing in runtime should import these snapshots. The `kokoro` gitlink is not needed by the server-side speech path.

## Limitations and release gate

This remains a trusted single-user local application, not a multi-tenant hosted service. Prompt rules do not enforce permissions. OS-level access to the same account, malicious local processes racing filesystem operations, model correctness, and downloaded model licenses remain outside application-level guarantees. Before release, resolve the tracked-data/history exposure, run CI on supported platforms, and complete real Ollama/browser/TTS smoke checks. See the final validation and release checklist added by this pass.

## Remediation completed in this pass

The critical model-controlled browser confirmation bypass was removed. Confirmation records now clone exact arguments, persist atomically, bind to user/chat/tool, expire, and cannot be executed twice. Guardrail errors fail closed. Agent model turns have a finite hard cap and a provider-reaching deadline; cheap tools no longer refund turns.

Filesystem writes and reads now use a common runtime root, per-user/project/chat artifact scopes, size/extension limits, lexical containment, and component-by-component symlink/junction rejection. The generated-preview iframe no longer has same-origin privileges. Browser and web requests validate credentials/protocols, all DNS answers, redirects, subrequests, and private/reserved address ranges; response sizes and timeouts are bounded.

Node and Python HTTP paths now default to loopback and apply Host/Origin, rate, request-body, content-type, malformed-JSON, nesting, and forbidden-key controls. Server-side errors sent to clients are reduced for newly reviewed paths. Provider responses are bounded/cancellable. Agent audit and local metric records use explicit metadata allowlists rather than arbitrary tool payloads or prompt text.

The verified memory/RAG flow now avoids duplicate prompt injection, catches retrieval failure, preserves lexical fallback, caches/deduplicates embeddings, avoids comparing vectors from different embedding models, and scopes replacement/search/deletion/summaries/plans/artifacts by the available user/project/conversation keys. Context packing terminates, preserves system policy, and rejects protected content that cannot fit.

Startup scripts consistently select the full Node runtime. Diagnostics cover Ollama, selected model, embedding fallback, frontend, browser binary, and optional TTS. Kokoro imports its model stack lazily and applies bounded speech inputs/concurrency. The frontend reports local service and response-context status, uses server-backed typed confirmations, and no longer silently bypasses the Hazy backend after HTTP errors.

## Repository and history scan results

Runtime cache, conversations, RAG/browser/usage records, generated output, backup source copies, archives, binary reports, the backup frontend, and the incomplete `kokoro` gitlink were removed from the Git index and covered by `.gitignore`. Local copies were retained. Source discovery no longer depends on any of those paths.

A repository-wide scan covered 511 reachable Git blobs and 877 nested archive entries (to three archive levels, with bounded entry/blob sizes). It found an apparent Tavily credential in archived `config/hazy-config.json` copies introduced by commit `a89cce5`. The value is intentionally omitted here. Removing the current archives does not remediate history; revoke/rotate the key, inspect provider activity, and rewrite all affected Git refs before release. The release checklist treats this as blocking.

## Final verification comparison

| Check | Baseline | After remediation |
| --- | --- | --- |
| Node unit suite | 128 pass, 5 fail, context packer timed out | 160 pass, 0 fail, 0 skipped on Node 24.14.0 |
| Supported Node check | Not run | 160 pass, 0 fail, 0 skipped on Node 22.13.1 |
| Python suite | 8 pass after dependencies | 13 pass, 0 fail on Python 3.11 |
| Optional Ollama integration | Not separated | 2 explicit tests, both skipped because opt-in was disabled/Ollama unavailable |
| Dependency install/audit | 2 packages, 0 vulnerabilities | `npm ci` succeeds; 3 audited packages, 0 vulnerabilities |
| Startup smoke | Not available | Loopback static UI, logo, basic/detailed health, hostile Origin, and malformed URL checks pass |
| Syntax checks | Not recorded | 57 JavaScript files checked; Python backend/controller/TTS/boundary/tests compile |

The local benchmark on this audit host (Node 24.14.0, without Ollama) measured 161.13 ms initialization, 1.30 ms synthetic lexical retrieval, 0.67 ms empty memory lookup, and 57.2 MiB process RSS. Model-response and embedding latency were not measured because Ollama was unavailable. These are one-machine diagnostics, not performance claims.

## Remaining findings

The historical credential and archive blobs are the release-blocking security issue. Real Ollama generation, semantic embeddings, Playwright navigation, Kokoro audio generation, cloud providers, and CI runners outside this Windows host remain manual/CI checks. The frontend still depends on several CDN assets for a fully featured first render. Streamed response review cannot retract bytes already displayed. SQLite/RAG/artifacts remain plaintext, and same-user filesystem races require OS isolation for a stronger boundary. The experimental Postgres/Redis server and Python compatibility proxy still lack full Node feature parity. Token accounting is heuristic, and the monolithic Node server/frontend should be split only through incremental compatibility-preserving work.
