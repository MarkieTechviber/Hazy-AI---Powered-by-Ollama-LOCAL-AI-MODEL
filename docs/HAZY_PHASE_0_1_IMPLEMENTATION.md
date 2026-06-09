# Hazy AI Phase 0–1 Implementation Notes

This build moves Hazy AI further toward a web-first local companion workspace instead of a terminal-first agent.

## Phase 0 — Architecture Direction

- The backend owns tools, provider keys, search runs, confirmations, audit logs, and local workflow permissions.
- The web dashboard remains the primary experience. Terminal/device control stays a backend-governed tool category, not the main product surface.
- Agent policy now describes the dashboard-first flow: resume session, load context, classify intent, choose allowed tools, pass tool calls through the gatekeeper, save events, and return streamed output.
- Tool metadata now carries a `toolset` field and includes the `device_control` risk class for future admin-only device workflows.

## Phase 1 — Web Search and Extraction

Implemented or upgraded modules:

- `backend/webSearch/searchRouter.js`
- `backend/webSearch/queryPlanner.js`
- `backend/webSearch/searchProviders.js`
- `backend/webSearch/resultFilter.js`
- `backend/webSearch/sourceQuality.js`
- `backend/webSearch/pageFetcher.js`
- `backend/webSearch/contentExtractor.js`
- `backend/webSearch/chunker.js`
- `backend/webSearch/reranker.js`
- `backend/webSearch/contextBuilder.js`
- `backend/webSearch/citationBuilder.js`
- `backend/webSearch/searchRunStore.js`
- `backend/webSearch/webSearchService.js`

The router now uses the requested search modes:

- `none`
- `quick_web`
- `deep_web`
- `official_only`
- `domain_limited`
- `fresh_required`
- `research_mode`

The pipeline now supports:

- multi-query planning with follow-up resolution
- official/source-first routing for technical and high-stakes factual questions
- normalized provider results with domain, provider name, raw rank, source name, date, and quality signals
- unsafe URL filtering before fetch
- DNS/private-network/localhost/file URL safety in the fetcher
- redirect re-checking
- response timeout and max-size enforcement
- no JavaScript execution during extraction
- title, description, author, date, canonical URL, and main text extraction
- prompt-injection pattern detection in webpage text
- semantic chunking with source metadata on every chunk
- reranking by relevance, quality, freshness, official-source status, diversity, and conflict signals
- compact web-evidence context blocks with source IDs
- citation/source cards and source-panel data
- persisted search run history

## Web Dashboard Updates

The answer source panel now shows:

- search mode
- why search was used
- confidence
- queries
- sources read
- sources rejected
- fetch failures
- citations
- warnings

A backend search history endpoint is available at:

- `GET /hazy/search-history?userId=local-user&limit=20`

