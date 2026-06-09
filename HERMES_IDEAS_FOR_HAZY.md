# Hermes Agent → Hazy AI: Feature Transfer Study

**Authored:** June 9, 2026  
**Purpose:** Extract the best architectural ideas from Hermes Agent (studied via the 2,716-line source code analysis) and apply them to improve Hazy AI.

---

## Summary: What Hermes Agent Is (and Isn't)

Hermes Agent is a **5,500+ file, 105MB Python/TypeScript local-first AI agent platform**. It has:

- Core agent loop with tool calling
- Model provider fallback system (switches providers on failure)
- Tool registry with toolset-based permission groups
- SQLite session database with FTS search
- Markdown-based memory system (MEMORY.md / USER.md)
- Skills system (reusable instruction packages)
- Plugin architecture (extend tools, providers, platforms, hooks)
- **Subagent delegation** (spawn child agents for subtasks)
- **Cron/scheduled automation** (recurring agent jobs with delivery)
- **Multi-surface delivery** (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, webhooks, etc.)
- **Web dashboard** with full config/session/cron/skill management
- **Terminal UI** (React/Ink) and desktop Electron shell
- **Kanban/todo system** for task coordination
- **Context compression** for long conversations
- **File mutation verification** (confirms writes actually happened)
- **Tool bridge** (model can search/describe tools dynamically)
- **Evaluation and testing** with broad integration/security tests

---

## The Key Idea: Hermes Is What Hazy Could Become

Hazy already has ~80% of the architecture Hermes has, but Hermes executes better on the remaining 20%. Here's what to steal:

---

## HIGH PRIORITY: Features Hazy Needs Most (Ranked by Impact)

### 1. Subagent Delegation System ⭐⭐⭐⭐⭐

**What Hermes does:** Spawns child agents for subtasks. Each subagent gets isolated context, tools, terminal session. Parent collects results. Has depth limits to prevent runaway recursion.

**Current Hazy state:** No delegation. Single-threaded agent.

**How to implement in Hazy:**
```
1. Create backend/agent/delegate.js
2. Spawn function: new AIAgent({ goal, context, allowedTools })
3. Run in isolated context, return summary
4. Parent agent collects multiple subagent results
5. Depth limit: max 2 levels of delegation
6. Frontend shows subagent progress ("Working on subtask 1/3...")
```

**Use cases this unlocks:**
- "Research X, Y, and Z simultaneously and compare"
- "Review my code for bugs, security, and performance in parallel"
- "Find me the best React library for state management, date handling, and forms — compare all three"

---

### 2. Toolset/Permission Groups ⭐⭐⭐⭐⭐

**What Hermes does:** Tools are organized into named groups (`terminal`, `file`, `browser`, `web`, `memory`, `cron`, `messaging`, `webhook-safe`). Config can enable/disable toolsets. Different contexts (cron, webhooks, gateway) get different toolset defaults.

**Current Hazy state:** Tools are individually registered. No grouping concept.

**How to implement in Hazy:**
```
backend/tools/toolsets.js:

const TOOLSETS = {
  safe_search: ['web.search'],
  computation: ['web.search', 'calculator.evaluate'],
  file_access: ['web.search', 'calculator.evaluate', 'file.read'],
  full_create: ['web.search', 'calculator.evaluate', 'file.read', 'file.write'],
  browser: ['web.search', 'browser.navigate', 'browser.click', 'browser.extract'],
  sandbox: ['web.search', 'calculator.evaluate', 'code.execute'],
}

// In config:
// toolsets: ['computation'] → only search + calculator
// toolsets: ['full_create'] → search + calculator + read + write
```

**Why this matters:** Users should be able to say "I only want Hazy to search, not touch my files." Currently there's no distinction.

---

### 3. Provider Fallback Chain ⭐⭐⭐⭐

**What Hermes does:** If primary provider fails (auth error, rate limit, timeout, context overflow), automatically tries fallback providers in order. Restores primary provider state between turns.

**Current Hazy state:** No fallback. If Ollama is down, request fails.

**How to implement:**
```javascript
// backend/ai/fallbackRouter.js

const FALLBACK_CHAIN = [
  { provider: 'ollama', model: 'llama3.2' },
  { provider: 'groq', model: 'groq/llama-3.3-70b' },
  { provider: 'openai', model: 'openai/gpt-4o-mini' },
];

async function callWithFallback(messages, tools) {
  for (const target of FALLBACK_CHAIN) {
    try {
      return await callProvider(target, messages, tools);
    } catch (err) {
      if (isRetryable(err)) continue;
      throw err; // Non-retryable — don't fallback
    }
  }
  throw new Error('All providers exhausted');
}
```

---

### 4. Cron / Scheduled Automation ⭐⭐⭐⭐

**What Hermes does:** Create jobs with schedule (cron expression, interval, one-shot), prompt, allowed toolsets. Scheduler runs them, saves output, optionally delivers to messaging platforms. Has lock mechanism to prevent overlapping runs.

**Current Hazy state:** No scheduling. Interactive only.

**How to implement:**
```javascript
// backend/cron/scheduler.js

// Store: SQLite table 'cron_jobs'
// Fields: id, name, prompt, schedule_expression, toolsets, enabled, last_run, next_run

// Scheduler: setInterval every 30 seconds
// 1. Query jobs WHERE next_run <= now() AND enabled = true
// 2. For each: spawn agent with restricted toolsets
// 3. Save output to cache/cron-output/
// 4. Deliver to user via notification (Telegram, desktop, etc.)

// Schedule formats:
// 'every 2h' → interval
// '0 9 * * *' → cron expression
// '2026-07-01T09:00:00' → one-shot
```

**Use cases:**
- "Every morning at 8am, summarize tech news"
- "Every hour, check if my server is up and tell me if it's down"
- "Remind me about my meeting every day at 9:45am"

---

### 5. Context Compression ⭐⭐⭐

**What Hermes does:** When conversation exceeds token limit, automatically summarizes older messages to keep context manageable without losing important information.

**Current Hazy state:** No compression. If conversation gets too long, either truncates or fails.

**How to implement:**
```javascript
// backend/ai/context/contextCompressor.js

async function compressIfNeeded(messages, maxTokens) {
  const currentTokens = estimateTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  // Split: keep last 10 messages intact, summarize older ones
  const older = messages.slice(0, -10);
  const recent = messages.slice(-10);

  // Call Ollama with summarization prompt
  const summary = await summarize(older);

  // Return: [summary as system] + [recent messages]
  return [
    { role: 'system', content: `Previous conversation summary: ${summary}` },
    ...recent
  ];
}
```

---

### 6. Skills System ⭐⭐⭐

**What Hermes does:** Reusable instruction packages (SKILL.md files) that agents load when relevant. Skills contain prompts, workflows, and known gotchas. Agents discover and load skills dynamically.

**Current Hazy state:** No skills concept. All behavior is hardcoded.

**How to implement:**
```javascript
// backend/skills/skillLoader.js

// Skills stored as .md files in cache/skills/
// Format:
// ---
// name: react-debugging
// trigger: React, JSX, component rendering issue
// ---
// # React Debugging Skill
// 1. Check component hierarchy...
// 2. Inspect state changes...
// 3. Look for missing keys...

// Agent loads skills by searching for trigger keywords in user message
// Appends skill content to system prompt
```

**Why this matters:** Instead of hardcoding "coding help" prompts, skills make behavior extensible. Users can create custom skills for their workflows.

---

### 7. File Mutation Verification ⭐⭐⭐

**What Hermes does:** After file writes/patches, verifies the file actually changed. If verification fails, appends a warning to the final response.

**Current Hazy state:** No verification. Agent might claim "file written" when it failed silently.

**How to implement:**
```javascript
// In toolExecutor.js, after file.write:

async function verifyWrite(filePath, expectedContent) {
  try {
    const actual = fs.readFileSync(filePath, 'utf8');
    if (actual.includes(expectedContent.substring(0, 100))) {
      return { verified: true };
    }
    return { verified: false, reason: 'Content mismatch' };
  } catch (err) {
    return { verified: false, reason: err.message };
  }
}
```

---

### 8. Tool Bridge / Dynamic Tool Discovery ⭐⭐

**What Hermes does:** The model can call `tool_search`, `tool_describe`, `tool_call` to discover and use tools it doesn't know about yet. Scoped to currently-allowed tools only.

**Current Hazy state:** Static tool list. Model can only use what's in the initial schema.

**How to implement:** Add `tool.list` and `tool.describe` tools that return the current tool catalog. The model can use these to adapt to available capabilities dynamically.

---

## MEDIUM PRIORITY: Nice-to-Haves

| Idea from Hermes | What It Does | Effort | Impact |
|---|---|---|---|
| Plugin architecture | Extend tools/providers/hooks externally | HIGH | HIGH |
| Web dashboard | Full config/sessions/cron/skills UI | HIGH | MEDIUM |
| Kanban/todo | Task boards for multi-step workflows | MEDIUM | MEDIUM |
| Gateway session mapping | Per-platform/per-chat session isolation | MEDIUM | LOW (Hazy is single-user) |
| Tool definition caching | Don't rebuild tool schemas every turn | LOW | MEDIUM |
| Memory scrubbers | Prevent internal markers from leaking to output | LOW | MEDIUM |
| Atomic config writes | Write to .tmp then rename | LOW | MEDIUM |

---

## What Hermes Does WRONG (Don't Copy These)

| Anti-Pattern | Why It's Bad |
|---|---|
| Massive single files (main.py thousands of lines) | Hard to test, audit, and onboard |
| Plaintext state everywhere | Security risk if machine is shared |
| Too many optional integrations | Fresh install is confusing, many features broken by default |
| Complex gateway session rules | Session isolation bugs are hard to debug |
| Plugin trust model | Plugins are raw Python — no sandboxing |
| Dashboard auth is optional | Easy to accidentally expose to network |

---

## Implementation Priority for Hazy

```
TIER 1 (Do immediately — huge impact, low effort):
  1. Toolset groups ← makes tools manageable
  2. Provider fallback ← makes agent reliable
  3. Context compression ← prevents truncation failures
  4. File mutation verification ← prevents silent data loss

TIER 2 (Do next — high impact, medium effort):
  5. Subagent delegation ← unlocks parallel work
  6. Cron/scheduled jobs ← unlocks automation
  7. Skills system ← extensible behavior

TIER 3 (Longer term):
  8. Web dashboard rebuild
  9. Plugin architecture
  10. Tool bridge
```

---

## Merged Rebuild Plan

Integrating this Hermes study with the original HAZY_REBUILD_PLAN.md:

**Phase 1 (Core Fixes):** DuckDuckGo fix + embeddings + memory fix + summaries  
**Phase 2 (Memory):** LLM extraction + contradiction detection + decay  
**Phase 3 (Agent):** Unified mode + toolsets + fallback + delegation + cron + sandbox  
**Phase 4 (Intelligence):** LLM emotion/intent + eval framework + skills system  
**Phase 5 (Hardening):** Response buffering + compression + verification + backup