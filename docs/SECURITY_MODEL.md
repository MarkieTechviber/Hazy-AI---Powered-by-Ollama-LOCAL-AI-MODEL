# Security model

## Assets

Hazy protects provider keys, the vault master key, conversation and memory databases, RAG documents/indexes, browser history/screenshots, generated files, confirmation state, and the integrity of tool decisions. Message content and embeddings are private data even when they are not conventional credentials.

## Assumptions

- One trusted person controls the operating-system account and browser.
- The backend, Ollama, and Kokoro listen on loopback.
- The local operating system and installed model/runtime packages are not malicious.
- Cloud providers and public search are optional trust boundaries selected by the user.
- User/project/chat identifiers come from a trusted local client; they are scopes, not authentication.

## Control layers

| Boundary | Controls |
| --- | --- |
| HTTP | Loopback Host and exact Origin checks, body/depth/type limits, rate limits, generic errors, timeouts. |
| Provider | Secret vault, bounded response bodies, deadlines/cancellation, explicit provider routing. |
| Retrieval | User/project/conversation scoping, prompt-injection labels, bounded ranked chunks, lexical fallback. |
| Tools | Registry allowlist, JSON schema, role checks, guardrails, rate limits, immutable confirmations, audit decisions. |
| Files | Dedicated artifact root, safe path segments, extension/size limits, traversal and symlink/junction checks. |
| Network | HTTP(S) only, no URL credentials, DNS validation/pinning, private/reserved IP denial, redirect revalidation. |
| Browser | Dedicated Playwright context, routed subrequests, blocked downloads/service workers/WebSockets, session ownership. |
| Availability | Context/request/response limits, finite sessions and agent turns, tool/provider timeouts, bounded logs. |
| Privacy | Local storage defaults, metadata-only diagnostics/audit logs, no mandatory telemetry. |

Confirmations are keyed to an exact user, chat, tool, and cloned argument set; a resolved or expired record cannot be reused. The model cannot grant itself a role or pass a `confirmed` argument to bypass the gatekeeper.

## Prompt injection

Prompt instructions cannot establish authority. Retrieved documents and websites are wrapped as untrusted material and their content is not copied into audit logs. Tool execution depends on deterministic schema/role/guardrail/confirmation checks. The model can still be persuaded to produce misleading text or request an allowed tool, so users should verify sources and read consequential confirmations.

## File safety limits

The application checks every existing path component for symlinks/junctions before an agent file operation and confines normal writes to the per-chat artifact directory. This blocks common traversal and alias escapes. It does not defeat a malicious same-user process that races filesystem changes between checks and writes. Stronger isolation requires an OS/container sandbox with separate permissions.

## Network safety limits

DNS answers and redirects are checked, and validated addresses are pinned for Node fetches. Browser WebRTC and future browser protocol features need continued review. Explicit environment overrides can allow private networking; they should be treated as trusted-development settings. Public pages can return harmful content or large workloads inside allowed limits.

## Local data and secrets

The vault encrypts provider keys with AES-256-GCM. A configured invalid master key fails closed, and key-file creation is exclusive. Conversation SQLite files, RAG indexes, and generated artifacts are plaintext. Debugging should use synthetic data; never attach the runtime cache to an issue.

The history scan identified an apparent Tavily key in archived config inside commit `a89cce5`. Removing the archive from the current index does not invalidate that key or remove history. Rotation, provider-account review, and coordinated history rewriting are release blockers.

## Residual risks

- No remote authentication, CSRF session, or multi-tenant authorization layer.
- Response review cannot retract bytes already shown in a streamed answer.
- Heuristic token counts may differ from provider limits.
- Same-user malware can read plaintext data and potentially race filesystem checks.
- Model, dependency, voice, and downloaded browser supply chains retain their own risk.
- Optional cloud calls disclose their request data to the selected provider.
- The experimental production server has not established parity or internet-facing hardening.

## Safe operating guidance

Keep services on loopback, use full-disk encryption, update Ollama/Node/Python dependencies, review confirmation text, use a separate browser context as provided, and back up private data outside Git. Run the release checklist and a secret scan before publishing.

