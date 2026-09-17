'use strict';

const path = require('path');
const { MemoryManager } = require('./memoryManager');
const { HazyDatabase } = require('../storage/hazyDatabase');
const { makeKey, normalizeMemoryType: _normalizeType, extractAgentTrajectoryCandidates } = require('./memoryExtractor');

const AGENT_MEMORY_TYPES = ['agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question'];

// Scrubber (regex sanitize modeled on conversationSummary.stripThinkingBlocks)
const AGENT_MEM_BLOCK = /<agent-memory\b[^>]*>[\s\S]*?<\/agent-memory>/gi;
const AGENT_MEM_FENCE_OPEN = /<agent-working-memory\b[^>]*>/gi;
const AGENT_MEM_FENCE_CLOSE = /<\/agent-working-memory>/gi;
const AGENT_MEM_NOTE = /\[Note: Agent trajectory memory prefetched[\s\S]*?\]/gi;
const AGENT_MEM_INTERNAL = /\[INTERNAL: Prefetched agent memory[\s\S]*?\]/gi;

function stripAgentMemoryFences(value, options = {}) {
  // options.fullScrub=true (default for final/UI): remove inner payload blocks + outer.
  // options.fullScrub=false (for injection/packer token calc + block content): remove only outer fences/notes, *preserve* inner <agent-memory> payload blocks so model receives the actual trajectory data.
  const { fullScrub = true } = options;
  let s = String(value || '');
  if (fullScrub) {
    s = s.replace(AGENT_MEM_BLOCK, '');
  }
  s = s.replace(AGENT_MEM_FENCE_OPEN, '')
    .replace(AGENT_MEM_FENCE_CLOSE, '')
    .replace(AGENT_MEM_NOTE, '')
    .replace(AGENT_MEM_INTERNAL, '')
    .trim();
  return s;
}

function extractPayloadForInjection(prefetched) {
  // For prefetch injection + packer block: keep the labeled inner blocks (payload) but strip only outer notes/fences for cleanliness.
  return stripAgentMemoryFences(prefetched, { fullScrub: false });
}

// MemoryProvider stub (ABC-like contract per architecture)
class MemoryProvider {
  name() { return 'base'; }
  is_available() { return false; }
  initialize(/* profileHome */) { return; }
  prefetch(/* query, options */) { return ''; }
  sync_turn(/* userContent, assistantContent, options */) { return; }
  system_prompt_block() { return ''; }
  get_tool_schemas() { return []; }
  handle_tool_call(/* name, args */) { return null; }
  shutdown() { return; }
}

class BuiltInMemoryProvider {
  constructor(memoryManager) {
    this.mm = memoryManager || null;
    this._name = 'built-in';
  }
  name() { return this._name; }
  is_available() { return !!this.mm; }
  initialize(/* profileHome */) { /* reuses existing mm wiring */ }

  // True wrap/extend: delegate full op surface (remember/search/forget + salience/contradiction, agent types, scoping) to mm; use shared extractor.
  remember(args = {}) { return this.mm && this.mm.remember ? this.mm.remember(args) : { error: 'mm unavailable' }; }
  searchMemories(args = {}) { return this.mm && this.mm.searchMemories ? this.mm.searchMemories(args) : []; }
  forgetMemories(args = {}) { return this.mm && this.mm.forgetMemories ? this.mm.forgetMemories(args) : 0; }
  onTurnStart(info = {}) { if (this.mm && this.mm.onTurnStart) this.mm.onTurnStart(info); }

  prefetch(query = '', options = {}) {
    if (!this.mm) return '';
    const { conversationId = 'default', userId = 'default', projectId = '', planText = '', goal = '' } = options || {};
    const effectiveQuery = [goal, query, planText].filter(Boolean).join(' ').slice(0, 480);
    try {
      // delegate/augment via mm methods + agent rows (reuse mm logic)
      const relevant = this.mm.getRelevantMemory
        ? this.mm.getRelevantMemory({ conversationId, userId, projectId, query: effectiveQuery, limit: 8 })
        : [];
      const agentRows = this.mm.db ? this.mm.db.prepare(`
        SELECT type, key, value, confidence, conversation_id AS conversationId
        FROM memories
        WHERE user_id = ? AND status = 'active'
          AND (project_id = '' OR project_id = ?)
          AND conversation_id = ?
          AND type IN (${AGENT_MEMORY_TYPES.map(() => '?').join(',')})
        ORDER BY updated_at DESC, confidence DESC LIMIT 6
      `).all(userId, projectId || '', conversationId, ...AGENT_MEMORY_TYPES) : [];
      const items = [
        ...relevant,
        ...agentRows.map(r => ({ type: r.type, key: r.key, value: r.value, confidence: r.confidence, summary: `${r.key}: ${r.value}` }))
      ];
      if (!items.length) return '';
      const blocks = items.slice(0, 8).map((m) => {
        const v = String(m.value || m.summary || '').slice(0, 700);
        return `<agent-memory type="${m.type || 'explicit_fact'}" key="${(m.key || '').slice(0,80)}" confidence="${Number(m.confidence || 0.5).toFixed(2)}">\n${v}\n</agent-memory>`;
      }).join('\n');
      return `<agent-working-memory>\n${blocks}\n</agent-working-memory>\n[Note: Agent trajectory memory prefetched for observe/plan/reason using clean goal + prior plan. Use memory.* tools to query/update. Fenced blocks are scrubbed before any UI or re-injection.]`;
    } catch {
      return '';
    }
  }

  sync_turn(userContent = '', assistantContent = '', options = {}) {
    if (!this.mm) return;
    const { conversationId = 'default', userId = 'default', projectId = '', messages = null } = options || {};
    try {
      if (this.mm.recordTurn) {
        this.mm.recordTurn({ conversationId, userId, projectId, userMessage: String(userContent || '').slice(0, 4000), finalResponse: String(assistantContent || '').slice(0, 4000) });
      }
    } catch {}
    if (Array.isArray(messages)) {
      // reuse shared extractor for trajectory (no dupe)
      for (const m of messages) {
        try {
          if (m.role === 'tool' || m.role === 'assistant') {
            const cands = extractAgentTrajectoryCandidates(m.content || '', { source: 'sync_turn', role: m.role });
            for (const cand of cands) {
              this.mm.upsertMemory({
                userId, projectId, conversationId,
                type: cand.type, key: cand.key, value: cand.value, confidence: cand.confidence || 0.6
              });
            }
          }
        } catch {}
      }
    }
  }

  get_tool_schemas() { return []; }
  handle_tool_call() { return null; }
}

class MemoryOrchestrator {
  constructor({ builtIn = null, external = null } = {}) {
    this.providers = [];
    this._externalCount = 0;
    if (builtIn) this.registerProvider(builtIn, false);
    if (external) this.registerProvider(external, true);
  }
  registerProvider(provider, isExternal = false) {
    if (isExternal) {
      if (this._externalCount >= 1) return; // at most one external
      this._externalCount += 1;
    }
    if (provider) this.providers.push(provider);
  }

  // Delegation for full tool/hook surface (critical fix for tools no-op on default orch)
  _delegate(methodName, args) {
    for (const p of this.providers) {
      if (p && typeof p[methodName] === 'function') {
        try { return p[methodName](args); } catch (e) { return { error: e.message }; }
      }
    }
    return null;
  }

  remember(args) { return this._delegate('remember', args) || (this.memoryManager && this.memoryManager.remember ? this.memoryManager.remember(args) : null); }
  searchMemories(args) { return this._delegate('searchMemories', args) || (this.memoryManager && this.memoryManager.searchMemories ? this.memoryManager.searchMemories(args) : []); }
  forgetMemories(args) { return this._delegate('forgetMemories', args) || (this.memoryManager && this.memoryManager.forgetMemories ? this.memoryManager.forgetMemories(args) : 0); }

  async prefetchAll(cleanGoal = '', options = {}) {
    const parts = [];
    for (const p of this.providers) {
      if (p && typeof p.prefetch === 'function') {
        try {
          const r = await Promise.resolve(p.prefetch(cleanGoal, options));
          if (r) parts.push(String(r));
        } catch (e) {
          // non-fatal per arch
        }
      }
    }
    return parts.join('\n\n');
  }
  async syncAll(userContent = '', assistantContent = '', options = {}) {
    for (const p of this.providers) {
      if (p && typeof p.sync_turn === 'function') {
        try { await Promise.resolve(p.sync_turn(userContent, assistantContent, options)); } catch {}
      }
    }
  }
  onTurnStart(info = {}) {
    for (const p of this.providers) {
      if (p && typeof p.onTurnStart === 'function') {
        try { p.onTurnStart(info); } catch {}
      }
    }
  }
  stripFences(text, options) {
    return stripAgentMemoryFences(text, options);
  }
}

// Default wiring (reuses Hazy DB + MemoryManager exactly as built-in provider; no external by default)
const { DATA_DIR: dataDir } = require('../config/runtimePaths');
let defaultMemoryOrchestrator;
let defaultMMForFallback;
try {
  const dbPath = path.join(dataDir, 'hazy.db');
  const database = new HazyDatabase(dbPath);
  defaultMMForFallback = new MemoryManager(path.join(dataDir, 'memory'), { database });
  const builtIn = new BuiltInMemoryProvider(defaultMMForFallback);
  defaultMemoryOrchestrator = new MemoryOrchestrator({ builtIn });
  // Expose for ctx.services fallbacks / getOrch in agent paths (without editing server)
  defaultMemoryOrchestrator.memoryManager = defaultMMForFallback;
} catch (e) {
  // fallback empty orchestrator if db init fails in exotic env
  defaultMemoryOrchestrator = new MemoryOrchestrator({});
}

function createMemoryOrchestrator({ memoryManager } = {}) {
  if (memoryManager) {
    const builtIn = new BuiltInMemoryProvider(memoryManager);
    const o = new MemoryOrchestrator({ builtIn });
    o.memoryManager = memoryManager;
    return o;
  }
  return defaultMemoryOrchestrator;
}

module.exports = {
  MemoryOrchestrator,
  MemoryProvider,
  BuiltInMemoryProvider,
  createMemoryOrchestrator,
  stripAgentMemoryFences,
  extractPayloadForInjection,
  AGENT_MEMORY_TYPES,
  defaultMemoryOrchestrator
};
