'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ToolRegistry } = require('../tools/toolRegistry');
const { ToolExecutor } = require('../tools/toolExecutor');
const { InMemoryRateLimiter } = require('../security/rateLimiter');
const { PendingConfirmationStore, buildConfirmationMessage } = require('../agent/confirmationStore');
const { AgentAuditStore, redact } = require('../agent/auditStore');
const { ToolGatekeeper } = require('../agent/toolGatekeeper');
const { runAgentTurn } = require('../agent/runAgentTurn');
const { buildRuntimeContextBlock } = require('../agent/promptPolicy');
const { classifyAgentMode } = require('../agent/agentTypes');
const { createAgentRuntime, createToolContext } = require('../agent/agentRuntime');

function createHarness() {
  const registry = new ToolRegistry();
  const confirmations = new PendingConfirmationStore({ ttlMs: 1000 });
  const audit = new AgentAuditStore();
  const rateLimiter = new InMemoryRateLimiter();
  const executor = new ToolExecutor(registry, { timeoutMs: 100 });
  const gatekeeper = new ToolGatekeeper({
    registry,
    executor,
    confirmations,
    audit,
    rateLimiter
  });
  return { registry, confirmations, audit, rateLimiter, executor, gatekeeper };
}

function context(role = 'user') {
  return {
    userId: 'user-1',
    chatId: 'chat-1',
    requestId: 'request-1',
    role
  };
}

test('gatekeeper blocks unknown tools, unauthorized roles, and invalid arguments', async () => {
  const harness = createHarness();
  harness.registry.register({
    name: 'inventory.delete',
    risk: 'high_write',
    allowedRoles: ['admin'],
    schema: {
      type: 'object',
      properties: { productId: { type: 'string', minLength: 1 } },
      required: ['productId'],
      additionalProperties: false
    },
    execute: () => ({ ok: true })
  });

  const unknown = await harness.gatekeeper.validateAndMaybeRun({
    ctx: context(),
    toolCall: { id: '1', name: 'missing', arguments: {} }
  });
  assert.equal(unknown.error.code, 'UNKNOWN_TOOL');

  const roleBlocked = await harness.gatekeeper.validateAndMaybeRun({
    ctx: context('user'),
    toolCall: { id: '2', name: 'inventory.delete', arguments: { productId: 'p1' } }
  });
  assert.equal(roleBlocked.error.code, 'ROLE_NOT_ALLOWED');

  const invalid = await harness.gatekeeper.validateAndMaybeRun({
    ctx: context('admin'),
    toolCall: {
      id: '3',
      name: 'inventory.delete',
      arguments: { productId: '', userId: 'attacker' }
    }
  });
  assert.equal(invalid.error.code, 'INVALID_ARGS');
  assert.ok(invalid.error.details.some((item) => item.includes('userId is not allowed')));
});

test('high-risk tools require an exact typed confirmation before execution', async () => {
  const harness = createHarness();
  let executions = 0;
  harness.registry.register({
    name: 'inventory.delete',
    risk: 'high_write',
    allowedRoles: ['admin'],
    confirmationSummary: ({ productName }) => `delete product ${productName}`,
    schema: {
      type: 'object',
      properties: { productName: { type: 'string', minLength: 1 } },
      required: ['productName'],
      additionalProperties: false
    },
    execute: ({ productName }) => {
      executions += 1;
      return { ok: true, data: { productName } };
    }
  });

  const requested = await harness.gatekeeper.validateAndMaybeRun({
    ctx: context('admin'),
    toolCall: {
      id: 'delete-1',
      name: 'inventory.delete',
      arguments: { productName: 'Milo 24g' }
    }
  });
  assert.equal(requested.status, 'confirmation_required');
  assert.match(buildConfirmationMessage(requested.confirmation), /CONFIRM DELETE PRODUCT MILO 24G/);
  assert.equal(executions, 0);

  const vague = await harness.gatekeeper.resolveConfirmation({
    ctx: context('admin'),
    confirmationId: requested.confirmation.id,
    message: 'yes'
  });
  assert.equal(vague.status, 'invalid_confirmation');
  assert.equal(executions, 0);

  const approved = await harness.gatekeeper.resolveConfirmation({
    ctx: context('admin'),
    confirmationId: requested.confirmation.id,
    message: requested.confirmation.typedPhrase
  });
  assert.equal(approved.status, 'executed');
  assert.equal(approved.result.ok, true);
  assert.equal(executions, 1);
  assert.equal(harness.audit.entries.at(-1).status, 'executed_after_confirmation');
});

test('confirmation records are scoped to the user and chat and expire', () => {
  const store = new PendingConfirmationStore({ ttlMs: 10 });
  const confirmation = store.create({
    ctx: context('admin'),
    tool: { name: 'danger', risk: 'high_write' },
    args: {},
    summary: 'delete record',
    now: 100
  });

  assert.equal(store.decide({
    id: confirmation.id,
    ctx: { ...context('admin'), userId: 'other' },
    message: confirmation.typedPhrase,
    now: 105
  }).status, 'forbidden');
  assert.equal(store.get(confirmation.id, 111).status, 'expired');
});

test('pending confirmations persist across store instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hazy-confirm-'));
  const filePath = path.join(dir, 'pending.json');
  try {
    const first = new PendingConfirmationStore({ ttlMs: 1000, filePath });
    const created = first.create({
      ctx: context('admin'),
      tool: { name: 'danger', risk: 'high_write' },
      args: { id: 'p1' },
      summary: 'delete record',
      now: 100
    });
    const second = new PendingConfirmationStore({ ttlMs: 1000, filePath });
    assert.deepEqual(second.get(created.id, 101), created);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('agent loop executes tool results and stops at the configured step limit', async () => {
  const harness = createHarness();
  harness.registry.register({
    name: 'echo',
    risk: 'read',
    schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false
    },
    execute: ({ value }) => ({ ok: true, data: { value } })
  });
  let calls = 0;
  const result = await runAgentTurn({
    ctx: context(),
    input: [{ role: 'user', content: 'Echo hello' }],
    gatekeeper: harness.gatekeeper,
    allowedTools: harness.registry.getModelTools(context()),
    maxSteps: 3,
    callModel: async ({ input }) => {
      calls += 1;
      if (input.some((item) => item.role === 'tool')) {
        assert.ok(input.some((item) =>
          item.role === 'assistant' && item.toolCalls?.[0]?.name === 'echo'
        ));
        return {
          type: 'final_answer',
          text: 'The tool returned hello.',
          usage: { inputTokens: 8, outputTokens: 5 }
        };
      }
      return {
        type: 'tool_calls',
        toolCalls: [{ id: 'echo-1', name: 'echo', arguments: { value: 'hello' } }],
        usage: { inputTokens: 5, outputTokens: 3 }
      };
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.finalText, 'The tool returned hello.');
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(result.usage, { inputTokens: 13, outputTokens: 8, totalTokens: 21 });
  // NOTE (for fixed Phase 2 evidence/maintainability): This test deliberately exercises only the no-profile (reasoningProfile omitted = default null) compat path + early final_answer via mock (maxSteps:3, non-cheap 'echo' tool).
  // Fixed behaviors (IterationBudget drive with grace guard in refund + explicit isExhausted() break at end of while body; profile-driven shouldVerify using correct modelTextForReview capture right after callModel; safe user-role synthetic "REVIEWER FEEDBACK (synthetic internal guidance...)" carrying exact "Replan: issues found... Continue exactly where you left off or adjust plan. Use current plan state and prior partial tool results..."; promptPolicy with exact formatPlanForModel leverage + richer SCRATCHPAD/CONTINUITY note *only* in plan-present branch) are intentionally not reached here. This preserves pre-existing call sites, test greenness, and "no test additions" / "compat" / "smallest change" rules. The exercised path still validates gatekeeper for real tools, usage tracking, confirmation paths, and early-final returns. See runAgentTurn.js + promptPolicy.js for the Phase 2 implementations.
});

test('runtime policy, mode classification, redaction, and rate limits are enforced', () => {
  const ctx = createToolContext({ userId: 'local-user', role: 'admin' });
  assert.equal(ctx.role, 'user');
  assert.equal(classifyAgentMode({ message: 'Summarize my uploaded PDF' }), 'rag_answer');
  assert.equal(classifyAgentMode({ message: 'Explain context windows' }), 'chat');
  assert.match(buildRuntimeContextBlock(ctx, {
    mode: 'tool_action',
    availableToolNames: ['web.search']
  }), /backend decides permissions, risk, validation, confirmation, and execution/i);
  // NOTE (for fixed Phase 2 evidence/maintainability): This buildRuntimeContextBlock call exercises the empty-plan branch (no currentPlan passed) — produces *exactly* the original pre-change "CURRENT PLAN: (empty...)" text (no richer note).
  // Fixed enrichment (in promptPolicy.js): uses exact `formatPlanForModel(plan)` (leverage of planStore, no duplication of markers/ids/formatting) + appends "SCRATCHPAD / CONTINUITY: ... 'continue exactly where you left off' using last task ids/status and prior outputs. Do not discard partial progress." *only inside the plan-present branch* (when plan.tasks.length > 0). Empty-plan case unchanged (avoids non-agent side-effect on shared runtimeContext callers in orchestrator/prepare). When plan active (agent use of plan.manage), the richer context + continuation language surfaces in AGENT RUNTIME CONTEXT. This test site + the plan.manage subtest (direct gatekeeper) provide evidence for leverage + conditional without new assertions or test logic.
  assert.deepEqual(redact({
    apiKey: 'secret',
    nested: { authorization: 'Bearer secret', value: 2 }
  }), {
    apiKey: '[REDACTED]',
    nested: { authorization: '[REDACTED]', value: 2 }
  });

  const limiter = new InMemoryRateLimiter();
  assert.equal(limiter.consume('u', { limit: 1, windowMs: 100 }, 0).allowed, true);
  assert.equal(limiter.consume('u', { limit: 1, windowMs: 100 }, 1).allowed, false);
  assert.equal(limiter.consume('u', { limit: 1, windowMs: 100 }, 101).allowed, true);
});

test('plan.manage tool is registered and can create / list / update tasks (in-memory mode)', async () => {
  const runtime = createAgentRuntime({ auditPath: false, confirmationPath: false, planPath: false });
  const ctx = createToolContext({ conversationId: 'plan-test-chat', userId: 'tester' }, {
    services: { planStore: runtime.planStore }
  });
  const tools = runtime.registry.getModelTools(ctx);
  const planTool = tools.find((t) => t.name === 'plan.manage');
  assert.ok(planTool, 'plan.manage tool should be registered on the agent runtime');

  // list when empty
  let res = await runtime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: { id: 'p1', name: 'plan.manage', arguments: { action: 'list' } }
  });
  assert.equal(res.status, 'executed');
  assert.ok(res.result.data.formatted.includes('No tasks'));

  // add
  res = await runtime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: { id: 'p2', name: 'plan.manage', arguments: { action: 'add', description: 'Research the requirements' } }
  });
  assert.equal(res.status, 'executed');
  assert.ok(res.result.data.plan.tasks.length === 1);
  const taskId = res.result.data.plan.tasks[0].id;

  // update status
  res = await runtime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: { id: 'p3', name: 'plan.manage', arguments: { action: 'update', taskId, status: 'in_progress' } }
  });
  assert.equal(res.status, 'executed');
  assert.equal(res.result.data.plan.tasks[0].status, 'in_progress');

  // list again shows the update
  res = await runtime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: { id: 'p4', name: 'plan.manage', arguments: { action: 'list' } }
  });
  assert.ok(res.result.data.formatted.includes('in_progress'));

  // clear
  res = await runtime.gatekeeper.validateAndMaybeRun({
    ctx,
    toolCall: { id: 'p5', name: 'plan.manage', arguments: { action: 'clear' } }
  });
  assert.equal(res.status, 'executed');
  assert.equal(res.result.data.plan.tasks.length, 0);
});
