# HAZY AI PROJECT STUDY & AUDIT

## Overview
The project is a local‑first AI companion built on **Node.js** (backend) and a browser frontend. It uses **Ollama** for LLM inference and includes a fairly complex orchestration pipeline that:
1. Detects emotion/intent/safety.
2. Retrieves memory and RAG context.
3. Builds a system prompt for the LLM.
4. Calls the model via the provider router.
5. Post‑processes the response.

## Key Findings
| Area | Issue | Impact |
|------|-------|--------|
| **Prompt Construction** | `orchestrator.buildSystemPrompt` receives **empty arrays** for `memory` and `ragContext` (see `backend/orchestrator.js` line 125). | The LLM never sees any user‑specific memory or retrieved knowledge – core functionality disabled.
| **Semantic Embeddings** | `backend/rag/vectorSearch.js` defines a `embeddingService` field but **no instance** is ever created. | Hybrid lexical‑semantic scoring never runs; only token‑based similarity is used.
| **Vector Search Instantiation** | `vectorSearch` is created as `new VectorSearch(path.join(dataDir, "rag"))` without passing an embedding service. | Even if embeddings were configured elsewhere they wouldn’t be used.
| **Browser Tool Registration** | `registerBrowserTools` is called at the end of `createAgentRuntime` and the `ToolRegistry.discover` loads tools via their exported `register`. This works, but the **legacy comment** suggests “browser register kept (legacy pre‑Phase)”. No immediate bug, but worth confirming the tools are available in the default agent runtime.
| **Memory Retrieval** | `memoryManager.getRelevantMemory` is called in `analyzeMessage` and the result stored in `analysis.memory`, but never forwarded into the prompt (see above). | Same as prompt issue – memory is fetched but never used.
| **RAG Retrieval** | `vectorSearch.search` is called and stored in `analysis.ragContext` but not passed to the prompt. | No contextual grounding from indexed documents.

## Immediate Phase‑1 Fixes (Core)
1. **Pass memory & ragContext to the prompt** – modify the `prompt` object construction at line 117‑126 to include the actual arrays.
2. **Instantiate an embedding service** – create an `OllamaEmbeddingService` (from `backend/rag/embeddingService.js`) and attach it to the `VectorSearch` instance when the orchestrator is initialized.
3. **Optional: expose embedding service via the orchestrator** – expose the embedding service for future use (e.g., adding documents with embeddings).

## Phase‑2 Enhancements
- Add a utility script to **re‑index existing files** with embeddings (`vectorSearch.addDocumentsAsync`).
- Extend `memory.remember` / `memory.search` tools (already present) with a small wrapper to store semantic embeddings for memory items if needed.
- Verify **browser tool registration** by listing available tools via the `tool.list` endpoint.

## Deliverables
- Updated `backend/orchestrator.js` with proper prompt fields.
- Updated `backend/orchestrator.js` (or a new `backend/embeddingSetup.js`) that creates `new OllamaEmbeddingService()` and passes it to `VectorSearch`.
- A short **audit summary** in this markdown file (already created).

---
*All changes will be made directly in the repository. No code will be executed until the plan is written.*