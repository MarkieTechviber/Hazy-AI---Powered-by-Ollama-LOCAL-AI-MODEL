# Hazy AI — Complete Rebuild Plan

**Authored:** June 9, 2026  
**Target:** Transform Hazy from a promising prototype into a production-grade local AI companion with real capabilities.

---

## Audit Summary: What's Broken and What's Missing

After a full codebase review, here's everything that needs to change, categorized by severity:

---

### RED FLAGS (Must Fix — Current Code is Broken or Fake)

| # | Problem | File | Severity |
|---|---------|------|----------|
| 1 | **Memory extraction is regex-only, not LLM-based.** `memoryExtractor.js` uses `/remember/, /call me/, /i prefer/` — misses 90% of actual memory-worthy content. No contradiction detection. | `backend/memory/memoryExtractor.js` | CRITICAL |
| 2 | **Emotion detection is a regex keyword list.** 9 hardcoded patterns. "throw my laptop" = frustrated, but "I want to throw up" = neutral. Zero semantic understanding. | `backend/empathy/emotionDetector.js` | CRITICAL |
| 3 | **Response review runs AFTER streaming.** User already saw the bad output. `needsRewrite` flag is pointless — can't un-send text. | `backend/ai/responseReviewer.js` + `server.js:lines 490-496` | CRITICAL |
| 4 | **RAG is not semantic.** `embeddingService.js` has a functioning `OllamaEmbeddingService` class (calls `/api/embed`) but NOBODY USES IT. `vectorSearch.js` calls `buildLexicalVector()` instead — token counting, not embedding. | `backend/rag/embeddingService.js`, `backend/rag/vectorSearch.js` | CRITICAL |
| 5 | **DuckDuckGo provider uses the broken Instant Answer API.** `api.duckduckgo.com` only returns Wikipedia-style abstracts, not web results. The real DuckDuckGo search API is `lite.duckduckgo.com` or requires HTML scraping. | `backend/webSearch/searchProviders.js:lines 118-161` | HIGH |
| 6 | **Python backend is zombie code.** `backend/server.py` exists but doesn't use the orchestrator, memory, RAG, reasoning, or agent pipeline. README admits this. | `backend/server.py` | MEDIUM |
| 7 | **Agent mode has only 2 tools.** Calculator + web search. No file ops, no shell, no browser, no API calls. The gatekeeper architecture is ready for more but nothing is wired. | `backend/agent/agentRuntime.js:lines 28-75` | HIGH |
| 8 | **No code sandbox.** Website builder can preview HTML but can't execute backend code. User can't ask "run this Python script." | Missing entirely | HIGH |
| 9 | **No eval framework.** No way to measure if changes improve or degrade quality. Each model/provider switch is blind. | Missing entirely | HIGH |
| 10 | **Conversation summaries bypass the LLM** (likely). `conversationSummary.js` uses `clampText` — probably just truncation. | `backend/memory/conversationSummary.js` | MEDIUM |

---

### YELLOW FLAGS (Works but Needs Rewrite for Quality)

| # | Problem | Fix |
|---|---------|-----|
| 11 | Intent detection is also regex-based. "search for X" = search intent, but "find me information about" = missed. | Rewrite with LLM classifier |
| 12 | The orchestrator builds memory context but `memory.map(m => m.summary)` often returns undefined because memories don't have a `summary` field — they have `key` and `value`. | Fix the memory block rendering |
| 13 | Reranker in `webSearch/reranker.js` — need to verify this is using actual scoring, not just keyword overlap. | Audit and replace with embedding-based rerank |
| 14 | Frontend `app.js` is 5,300+ lines in one file. Not a functional bug but a maintenance nightmare. | Modularize (Phase 4) |
| 15 | No `conversation_id` index on the memories table for efficient per-conversation lookups. | Add index |

---

## The Rebuild: 5 Phases

---

## PHASE 1: Make The Core Actually Work (3-5 days)

### 1.1 Fix DuckDuckGo Search (Real Web Results)

The current DDG provider calls `api.duckduckgo.com` which only gives Wikipedia Instant Answers — NOT web search results. Replace with a proper implementation:

**New approach:** Use `lite.duckduckgo.com/lite` (HTML-based, no API key needed):

- POST to `https://lite.duckduckgo.com/lite/` with form data `{ q: query }`
- Parse the HTML response for result rows
- Extract title, URL, snippet from each result
- Return normalized results

**Also add:** A fallback that uses `html.duckduckgo.com/html/` if `lite` fails.

### 1.2 Activate Semantic Embeddings

`OllamaEmbeddingService` is already written and functional. The problem is `vectorSearch.js` doesn't use it.

**Fix:**
1. Detect available Ollama embedding model (`nomic-embed-text` recommended, fall back to `all-minilm` or any available)
2. Pull the model if missing: `ollama pull nomic-embed-text`
3. Wire `OllamaEmbeddingService` into `vectorSearch.js` as the primary search method
4. Keep lexical as fallback for when Ollama is unavailable
5. Add embedding cache so re-indexing doesn't re-embed unchanged chunks

### 1.3 Fix Memory Block in Prompt Builder

In `orchestrator.js:line 163`, memory items are referenced as `item.summary` but the actual memory objects from SQLite have `key` and `value`:

**Fix:** `memory.map(item => \`- ${item.key}: ${item.value}\`)`

### 1.4 Ensure Conversation Summaries Use LLM

Audit `conversationSummary.js`. If it's just `clampText()` (truncation), replace with:
1. Collect last N turns of conversation
2. Send to Ollama with a summarization prompt
3. Store the LLM-generated summary
4. Keep summaries under 1600 chars

---

## PHASE 2: Real Memory With LLM Extraction (2-3 days)

### 2.1 LLM-Powered Memory Extraction

Kill the regex patterns in `memoryExtractor.js`. Replace with:

After every user turn, run a background extraction:
1. Send the user's message + context to a small/fast Ollama model
2. Prompt: "Extract any new facts, preferences, boundaries, goals, or project facts from this message. Return JSON. Include: type, key, value, confidence."
3. Parse the JSON, validate, deduplicate, upsert into SQLite

**Types to extract:**
- `personal_fact` — "My name is...", "I live in..."
- `preference` — "I prefer Python over Java", "I like short answers"
- `boundary` — "Don't call me sir", "I hate small talk"
- `project_fact` — "I'm building a React app", "The API is at..."
- `goal` — "I want to finish this by Friday"

### 2.2 Contradiction Detection

When extracting new memories, compare against existing ones:
- Same key, different value → flag as contradiction → lower confidence on old, add new with note
- Auto-resolve if new confidence is significantly higher

### 2.3 Memory Expiry and Decay

Current system only expires on `TEMPORARY_PATTERN` match ("today", "this week"). Add:
- Access-count-based decay (memories never accessed after 30 days drop confidence)
- Explicit "forget about X" with fuzzy matching
- Memory summary in system prompt limited to top-N by confidence+recency

---

## PHASE 3: Real Agent Capabilities (4-6 days)

### 3.1 Unified Mode System (Chat ↔ Agent are NOT separate)

**The vision:** One chat interface. The model decides when to use tools — no toggle needed.

**Implementation:**
1. Remove the frontend Agent Mode toggle
2. Always enable agent mode for providers that support it
3. The model gets tools by default; it uses them when it needs to
4. The user just chats normally — if they ask "search for X" the model calls web.search
5. Keep the gatekeeper for safety — all tool calls still validated

### 3.2 New Tools to Add

| Tool | Priority | Description |
|------|----------|-------------|
| `web.search` | EXISTS | Improve with real DDG results |
| `calculator.evaluate` | EXISTS | Already solid |
| `file.read` | P0 | Read files from allowed directories |
| `file.write` | P1 | Write files to workspace (with confirmation) |
| `code.execute` | P1 | Run Python in isolated subprocess |
| `browser.navigate` | P2 | Headless browser for web automation |
| `browser.click` | P2 | Interact with pages |
| `browser.extract` | P2 | Extract page content |
| `api.fetch` | P2 | Make HTTP requests to APIs |

### 3.3 Code Sandbox

```javascript
// backend/tools/codeExecutor.js
// 1. Create temp directory
// 2. Write code to temp file
// 3. Spawn: docker run --rm --network=none --memory=256m 
//    --cpus=0.5 -v /tmp/sandbox:/code python:3-slim python /code/script.py
// 4. Capture stdout/stderr with 30s timeout
// 5. Clean up temp directory
// Falls back to subprocess if Docker is unavailable
```

### 3.4 Browser Automation Tool

```javascript
// backend/tools/browserTool.js
// Uses Puppeteer/Playwright in headless mode:
// 1. browser.navigate(url) → returns page text snapshot
// 2. browser.click(selector) → click element
// 3. browser.extract(selector) → extract text/content
// 4. browser.screenshot → take screenshot
// All behind gatekeeper with rate limits and URL allowlists
```

---

## PHASE 4: Smart Intent & Emotion (2-3 days)

### 4.1 Replace Regex Emotion Detection

Current: 9 hardcoded regex patterns. "I want to throw up" = neutral.

**New approach — LLM-based classification:**
1. Send user message to a tiny/fast model (e.g. `llama3.2:1b` or even a dedicated classifier)
2. Prompt: "Classify this message: {emotion, intensity (0-1), user_need, recommended_tone}. Emotions: neutral, frustrated, sad, anxious, excited, proud, angry, overwhelmed, curious, confused, grateful, hopeful. Return JSON."
3. Cache results for identical messages
4. Fall back to regex if Ollama is down

### 4.2 Intent Detection — Same Treatment

Current: regex patterns for "search", "code", etc.

Replace with LLM classifier that categorizes into:
- `general_chat`, `technical_question`, `coding_request`, `web_search_needed`
- `emotional_support`, `brainstorming`, `task_planning`, `factual_question`
- Route differently based on intent

### 4.3 Evaluation Framework

Create `backend/tests/eval/`:

```
eval/
  dataset.json       # 50+ test cases with golden answers
  metrics.js         # Precision, recall, F1 for memory extraction
  harness.js         # Runs all tests against any model/provider
  reporter.js        # Outputs scored report
```

Categories:
- Memory extraction accuracy (did it catch the preference?)
- Emotion classification accuracy
- Web search citation correctness
- Code generation validity
- Safety refusal rate

---

## PHASE 5: Production Hardening (2-3 days)

### 5.1 Response Buffering + Pre-Delivery Review

**Critical fix for the "review after streaming" problem:**

```
server.js — handleHazyChat changes:
Instead of streaming directly:
1. Collect FULL response before sending to client
2. Run reviewResponse() on the complete text
3. If approved → stream to client
4. If needsRewrite → regenerate with feedback
For high-risk turns: buffer + review. For normal chat: stream directly.
Threshold: riskLevel >= 'medium' OR intent === 'coding' → buffer
```

### 5.2 Kill Python Backend

Delete `backend/server.py` and update `start.bat` to remove the Python fallback path. Node.js is canonical.

### 5.3 Add Recovery & Backup

- Auto-backup SQLite before migrations
- Export all memories/conversations as JSON
- Import from JSON backup

### 5.4 Performance

- Embedding cache (don't re-embed unchanged chunks)
- Search result cache with 5-minute TTL
- Lazy-load tools (only instantiate what's used)

---

## Implementation Order (Dependency Graph)

```
Phase 1 (Core fixes)
├── 1.1 DuckDuckGo real search ─────────────┐
├── 1.2 Semantic embeddings ────────────────┤ These three are independent
├── 1.3 Memory block fix ───────────────────┤
└── 1.4 Conversation summaries via LLM ─────┘
         │
Phase 2 (Memory) ← depends on 1.3
├── 2.1 LLM memory extraction
├── 2.2 Contradiction detection
└── 2.3 Expiry/decay
         │
Phase 3 (Agent) ← depends on 1.1, 1.2
├── 3.1 Unified mode (no toggle)
├── 3.2 New tools
├── 3.3 Code sandbox
└── 3.4 Browser automation
         │
Phase 4 (Intelligence) ← can start in parallel with Phase 3
├── 4.1 LLM emotion detection
├── 4.2 LLM intent detection
└── 4.3 Eval framework
         │
Phase 5 (Hardening) ← depends on all above
├── 5.1 Response buffering
├── 5.2 Kill Python backend
├── 5.3 Backup/recovery
└── 5.4 Performance
```

---

## What The Final System Looks Like

After all 5 phases, Hazy is:

```
User types a message → Frontend sends to /hazy/chat
    │
    ▼
Orchestrator
    ├── LLM-based emotion detection → "frustrated, intensity: 0.7"
    ├── LLM-based intent detection → "coding_request + web_search_needed"
    ├── Semantic RAG search → pulls relevant document chunks
    ├── Memory lookup → user's preferences, project facts
    ├── Reasoning profile → "structured reasoning, 1536 token budget"
    │
    ▼
Agent Loop (always available, no toggle)
    ├── Model decides: needs web search → calls web.search
    │     └── DuckDuckGo (free) → extracts pages → reranks with embeddings
    ├── Model decides: needs calculation → calls calculator.evaluate
    ├── Model decides: needs code execution → calls code.execute (sandboxed)
    ├── Model decides: needs browser → calls browser.navigate (headless)
    │
    ▼
Response collected fully → reviewResponse() checks safety/quality
    │
    ▼
If OK → stream to frontend
If issues → rewrite silently → stream
    │
    ▼
Post-response:
    ├── LLM extracts new memories (preferences, facts, boundaries)
    ├── Detects contradictions with existing memories
    ├── Updates conversation summary
    └── Logs to SQLite
```

**One mode. One pipeline. Everything just works.**