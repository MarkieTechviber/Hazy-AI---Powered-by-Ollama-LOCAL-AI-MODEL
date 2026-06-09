'use strict';

const crypto = require('crypto');
const path = require('path');
const { ToolRegistry, DEFAULT_ROLES } = require('../tools/toolRegistry');
const { ToolExecutor } = require('../tools/toolExecutor');
const { webSearch } = require('../tools/webSearchTool');
const { defaultBrowserSystem, registerBrowserTools } = require('../browser/browserTool');
const { evaluateArithmetic } = require('../ai/reasoning/calculator');
const { InMemoryRateLimiter } = require('../security/rateLimiter');
const { PendingConfirmationStore } = require('./confirmationStore');
const { AgentAuditStore } = require('./auditStore');
const { ToolGatekeeper } = require('./toolGatekeeper');

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

function createAgentRuntime({ auditPath = null, confirmationPath = null } = {}) {
  const registry = new ToolRegistry();
  registry.register({
    name: 'web.search',
    description: 'Search the web for current or externally verifiable information, extract sources, and build citation-ready evidence.',
    risk: 'read',
    toolset: 'web',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
        mode: { type: 'string', enum: ['quick_web', 'deep_web', 'official_only', 'domain_limited', 'fresh_required', 'research_mode'] }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute: ({ query }, ctx) => (
      ctx.services?.testWebSearchResult
      || webSearch({
        userMessage: query,
        messages: ctx.services?.messages || [],
        cfg: ctx.services?.config || {},
        userId: ctx.userId,
        chatId: ctx.chatId,
        messageId: ctx.requestId,
        forceSearch: true,
        decision: ctx.services?.searchDecision
      })
    )
  });
  registerBrowserTools(registry, defaultBrowserSystem);
  registry.register({
    name: 'calculator.evaluate',
    description: 'Evaluate a basic arithmetic expression without running arbitrary code.',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', minLength: 1, maxLength: 300 }
      },
      required: ['expression'],
      additionalProperties: false
    },
    execute: ({ expression }) => ({
      ok: true,
      data: { expression, value: evaluateArithmetic(expression) }
    })
  });

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
  const rateLimiter = new InMemoryRateLimiter();
  const executor = new ToolExecutor(registry, { timeoutMs: 15_000, retries: 0 });
  const gatekeeper = new ToolGatekeeper({
    registry,
    executor,
    confirmations,
    audit,
    rateLimiter
  });

  return { registry, executor, confirmations, audit, rateLimiter, gatekeeper };
}

const defaultAgentRuntime = createAgentRuntime();

module.exports = {
  createAgentRuntime,
  createToolContext,
  defaultAgentRuntime
};
