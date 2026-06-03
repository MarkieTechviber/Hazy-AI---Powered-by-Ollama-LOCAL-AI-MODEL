# Hazy AI Agent + Reasoning Update

This update connects Agent Mode to the real backend chat pipeline instead of leaving it as a frontend-only toggle.

## What changed

- `frontend/app.js`
  - Sends `agentEnabled` and `agentMaxIterations` in the `hazy` metadata.
  - Reads `X-Hazy-Trace` from `/hazy/chat` responses.
  - Displays a visible public **HAZY DECISION TRACE** before the final answer streams.

- `frontend/style.css`
  - Adds styling for the decision trace panel.

- `backend/server.js`
  - Runs deterministic backend tools before preparing the LLM request.
  - Sends public trace headers: `X-Hazy-Trace`, `X-Hazy-Agent-Enabled`, `X-Hazy-Tool-Used`.

- `backend/tools/toolRouter.js`
  - Detects real web/current/online search intent when Agent Mode is enabled.
  - Avoids false positives like `binary search` coding questions.
  - Injects tool context into the model request before generation.

- `backend/tools/webSearchTool.js`
  - Adds backend web search with Brave Search when configured.
  - Adds fallback providers for music/media-style searches: Apple iTunes Search, MusicBrainz, DuckDuckGo Instant Answer, and Wikipedia OpenSearch.

- `backend/ai/reasoning/reasoningSummaryBuilder.js`
  - Builds a safe public routing summary.
  - Does not expose private chain-of-thought.

- `backend/orchestrator.js` and `backend/ai/promptBuilder.js`
  - Pass tool results into the support prompt so the model knows tool context exists.

- `backend/tests/toolRouter.test.js`
  - Adds tests for web-search intent, query extraction, and agent metadata detection.

## Optional stronger search

For better general web search, add a Brave Search API key as one of these:

```bash
BRAVE_SEARCH_API_KEY=your_key_here
```

or in `config/hazy-config.json`:

```json
{
  "providers": {
    "search": {
      "braveApiKey": "your_key_here"
    }
  }
}
```

Without Brave, Hazy still uses free fallbacks, but exact/niche results may be weaker.

## Tested

```bash
cd backend
node --check server.js
node --check tools/toolRouter.js
node --check tools/webSearchTool.js
node --check ai/reasoning/reasoningSummaryBuilder.js
node --check ai/promptBuilder.js
node --check orchestrator.js
node --test
```

All tests passed.
