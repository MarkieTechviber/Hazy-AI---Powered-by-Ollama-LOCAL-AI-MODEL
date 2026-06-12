'use strict';

const crypto = require('crypto');
const path = require('path');
const { ToolRegistry, DEFAULT_ROLES } = require('../tools/toolRegistry');
const { ToolExecutor } = require('../tools/toolExecutor');
const { defaultBrowserSystem, registerBrowserTools } = require('../browser/browserTool');
const { InMemoryRateLimiter } = require('../security/rateLimiter');
const { PendingConfirmationStore } = require('./confirmationStore');
const { AgentAuditStore } = require('./auditStore');
const { ToolGatekeeper } = require('./toolGatekeeper');
const { PlanStore, formatPlanForModel } = require('./planStore');
const { defaultMemoryOrchestrator } = require('../memory/memoryOrchestrator');
const { makeKey } = require('../memory/memoryExtractor');

function createToolContext(body = {}, overrides = {}) {
  const requestedRole = String(overrides.role || 'user').toLowerCase();
  return {
    userId: String(overrides.userId || body.userId || 'local-user'),
    chatId: String(overrides.chatId || body.conversationId || 'default'),
    role: DEFAULT_ROLES.includes(requestedRole) ? requestedRole : 'user',
    tenantId: overrides.tenantId || body.tenantId || null,
    requestId: overrides.requestId || crypto.randomUUID(),
    services: overrides.services || {},
    enabledToolsets: overrides.enabledToolsets || body.hazy?.enabledToolsets || body.enabledToolsets || null,
    disabledToolsets: overrides.disabledToolsets || body.hazy?.disabledToolsets || body.disabledToolsets || []
  };
}

function createAgentRuntime({ auditPath = null, confirmationPath = null, planPath = null } = {}) {
  const registry = new ToolRegistry();
  try {
    registry.discover(path.join(__dirname, '..', 'tools'));
  } catch (e) {
    console.warn('[agentRuntime] tool discovery non-fatal:', e && e.message ? e.message : e);
  }
  // browser register kept (legacy pre-Phase); moved post plan/memory so discover runs before *any* register (satisfies literal prior claim).
  // web/calc self-reg now via discover + their register() exports (enhance of webSearchTool was per initial Phase4 guidance for removing hardcoded blocks).

  const confirmations = new PendingConfirmationStore({
    filePath: confirmationPath === false
      ? null
      : (confirmationPath || path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'confirmations', 'pending.json'))
  });
  const audit = new AgentAuditStore(
    auditPath === false
      ? null
      : (auditPath || path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'audit', 'tool-events.jsonl'))
  );
  const planStore = new PlanStore({
    filePath: planPath === false
      ? null
      : (planPath || path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'plans', 'agent-plans.json'))
  });
  const rateLimiter = new InMemoryRateLimiter();
  const executor = new ToolExecutor(registry, { timeoutMs: 15_000, retries: 0 });
  const gatekeeper = new ToolGatekeeper({
    registry,
    executor,
    confirmations,
    audit,
    rateLimiter
  });

  // Register the plan management tool (high-impact for agent reasoning & long-horizon tasks).
  // The model uses this to explicitly decompose work, track progress, and self-correct.
  registry.register({
    name: 'plan.manage',
    description: 'Maintain a persistent, model-visible task list (plan) for the current goal. Strongly recommended for any multi-step or long-running work. Actions: list (see current tasks), add (new task), update (change status or description by id), remove (by id), clear (remove all). Always call with action="list" first to see the live plan. Keep the plan accurate and complete — it is injected into your context on every turn and returned in tool results. Status values: todo, in_progress, done, blocked.',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'remove', 'clear'] },
        description: { type: 'string', minLength: 3, maxLength: 300, description: 'Required for action=add' },
        taskId: { type: 'string', description: 'Required for update and remove' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'], description: 'For action=update' }
      },
      required: ['action'],
      additionalProperties: false
    },
    execute: ({ action, description, taskId, status }, ctx) => {
      const store = ctx && ctx.services && ctx.services.planStore;
      if (!store) {
        return { ok: false, error: { code: 'PLAN_STORE_UNAVAILABLE', message: 'Plan store is not available in this context.' } };
      }
      const chatId = ctx.chatId || 'default';
      try {
        let resultPlan;
        if (action === 'list' || !action) {
          resultPlan = store.list(chatId);
        } else if (action === 'add') {
          if (!description) throw new Error('description is required for add');
          resultPlan = store.add(chatId, description);
        } else if (action === 'update') {
          if (!taskId) throw new Error('taskId is required for update');
          resultPlan = store.update(chatId, taskId, { description, status });
        } else if (action === 'remove') {
          if (!taskId) throw new Error('taskId is required for remove');
          resultPlan = store.remove(chatId, taskId);
        } else if (action === 'clear') {
          resultPlan = store.clear(chatId);
        } else {
          throw new Error(`Unknown action: ${action}`);
        }
        return {
          ok: true,
          data: {
            action,
            plan: resultPlan,
            formatted: formatPlanForModel(resultPlan),
            instruction: 'The plan above is now the live current plan. Use it to stay on track. Call plan.manage again with action="list" whenever you need to inspect it.'
          }
        };
      } catch (err) {
        return {
          ok: false,
          error: { code: 'PLAN_OPERATION_FAILED', message: err.message || String(err) }
        };
      }
    }
  });

  // Phase 3 memory tools (registered inside create, exactly like plan.manage; uses ctx.services or default orch)
  // Enhanced getOrch: prefers services (memoryOrchestrator or its .memoryManager or direct memoryManager), falls to default (which now exposes .memoryManager + delegates).
  const getOrch = (c) => {
    if (!c || !c.services) return defaultMemoryOrchestrator;
    return c.services.memoryOrchestrator || c.services.memoryManager || defaultMemoryOrchestrator.memoryManager || defaultMemoryOrchestrator;
  };
  registry.register({
    name: 'memory.remember',
    description: 'Store durable agent working memory / trajectory item (explicit_fact, agent_plan, agent_step, failed_attempt, artifact_ref, unresolved_question, etc). Use for self-correction, long-horizon tracking, discovered facts. Supports confidence/salience. Returns the stored record.',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['explicit_fact', 'agent_plan', 'agent_step', 'failed_attempt', 'artifact_ref', 'unresolved_question', 'preference', 'project_fact'], description: 'Category (defaults explicit_fact)' },
        key: { type: 'string', maxLength: 80, description: 'Optional short key (auto-derived if omitted)' },
        value: { type: 'string', minLength: 3, maxLength: 1200, description: 'Fact / plan / step / error / artifact / question text to remember' },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: '0-1 confidence or salience' }
      },
      required: ['value'],
      additionalProperties: false
    },
    execute: ({ type, key, value, confidence }, ctx) => {
      const orch = getOrch(ctx);
      try {
        const rec = (orch && (orch.remember || orch.upsertMemory))
          ? (orch.remember ? orch.remember({ type: type || 'explicit_fact', key, value, confidence: confidence || 0.7, userId: ctx.userId, conversationId: ctx.chatId || 'default' })
            : orch.upsertMemory({ type: type || 'explicit_fact', key, value, confidence: confidence || 0.7, userId: ctx.userId, conversationId: ctx.chatId || 'default' }))
          : null;
        if (rec && rec.error) {
          return { ok: false, error: { code: 'MEMORY_REMEMBER_FAILED', message: rec.error } };
        }
        return {
          ok: true,
          data: {
            remembered: true,
            type: type || 'explicit_fact',
            key: rec && rec.key ? rec.key : (key || makeKey(value)),
            value: String(value || '').slice(0, 120),
            confidence: rec && rec.confidence ? rec.confidence : (confidence || 0.7),
            instruction: 'Stored via agent memory. Call memory.search to retrieve. Fences scrubbed on output.'
          }
        };
      } catch (err) {
        return { ok: false, error: { code: 'MEMORY_REMEMBER_FAILED', message: err.message || String(err) } };
      }
    }
  });
  registry.register({
    name: 'memory.search',
    description: 'Query the agent working memory + trajectory (and user facts). Returns ranked items by relevance/confidence. Use often before replan or when facts may be relevant.',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300, description: 'Search text or goal keywords' },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
        types: { type: 'array', items: { type: 'string' }, description: 'Optional filter to specific memory types e.g. ["agent_plan","failed_attempt"]' }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute: ({ query, limit, types }, ctx) => {
      const orch = getOrch(ctx);
      try {
        let results = [];
        if (orch && orch.searchMemories) results = orch.searchMemories({ query, limit: limit || 5, types, userId: ctx.userId, conversationId: ctx.chatId || 'default' });
        else if (orch && orch.getRelevantMemory) results = orch.getRelevantMemory({ query, limit: limit || 5 });
        return { ok: true, data: { results, count: results.length, note: 'Use memory.remember to add more. Results are durable across turns.' } };
      } catch (err) {
        return { ok: false, error: { code: 'MEMORY_SEARCH_FAILED', message: err.message || String(err) } };
      }
    }
  });
  registry.register({
    name: 'memory.forget',
    description: 'Remove or disable specific memory entries by target phrase (or id if supported by provider). Use sparingly; "all" disables everything for the profile (destructive).',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        target: { type: 'string', minLength: 2, maxLength: 200, description: 'Phrase or key to forget (or "all")' },
        id: { type: 'string', description: 'Optional direct id' }
      },
      required: ['target'],
      additionalProperties: false
    },
    execute: ({ target, id }, ctx) => {
      const orch = getOrch(ctx);
      try {
        let changes = 0;
        if (orch && orch.forgetMemories) changes = orch.forgetMemories({ userId: ctx.userId, projectId: '', target });
        else if (orch && orch.deleteMemory && id) changes = orch.deleteMemory(id, ctx.userId) ? 1 : 0;
        if (changes && changes.error) {
          return { ok: false, error: { code: 'MEMORY_FORGET_FAILED', message: changes.error } };
        }
        return { ok: true, data: { forgotten: changes, target: target || id } };
      } catch (err) {
        return { ok: false, error: { code: 'MEMORY_FORGET_FAILED', message: err.message || String(err) } };
      }
    }
  });

  // Legacy browser tools registered last (after discover + Phase1 plan + Phase3 memory) so initial discover precedes every register call.
  registerBrowserTools(registry, defaultBrowserSystem);

  return { registry, executor, confirmations, audit, rateLimiter, gatekeeper, planStore, memoryOrchestrator: defaultMemoryOrchestrator };
}

const defaultAgentRuntime = createAgentRuntime();

module.exports = {
  createAgentRuntime,
  createToolContext,
  defaultAgentRuntime
};
