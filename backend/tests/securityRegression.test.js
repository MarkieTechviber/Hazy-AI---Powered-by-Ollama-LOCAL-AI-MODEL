'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR, ARTIFACTS_DIR } = require('../config/runtimePaths');
const { createAgentRuntime, createToolContext } = require('../agent/agentRuntime');
const { assertPublicUrl } = require('../webSearch/pageFetcher');
const { isPrivateIp } = require('../security/publicNetwork');
const { safeSegment } = require('../security/safePath');
const { validateJsonSchema } = require('../security/jsonSchemaValidator');
const { IterationBudget } = require('../agent/iterationBudget');
const { PendingConfirmationStore } = require('../agent/confirmationStore');
const { AgentAuditStore } = require('../agent/auditStore');
const { ToolRegistry } = require('../tools/toolRegistry');
const { runAgentTurn } = require('../agent/runAgentTurn');

test('private, mapped, alternative numeric and credential-bearing targets are blocked', async () => {
  for (const ip of ['127.5.6.7', '0.2.3.4', '100.64.1.1', '169.254.169.254', '::ffff:127.0.0.1', 'fe90::1', 'ff02::1', '::']) assert.equal(isPrivateIp(ip), true, ip);
  for (const target of ['http://2130706433/', 'http://0x7f000001/', 'http://127.2.3.4/', 'http://[::ffff:7f00:1]/', 'http://user:pass@example.com/']) await assert.rejects(() => assertPublicUrl(target));
  await assert.rejects(() => assertPublicUrl('https://public.example/', async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]));
});

test('model-provided confirmation, roles and prototype keys cannot grant authority', async () => {
  const runtime = createAgentRuntime({ auditPath: false, confirmationPath: false, planPath: false });
  const ctx = createToolContext({ role: 'admin', hazy: { role: 'admin' } });
  assert.equal(ctx.role, 'user');
  const response = await runtime.gatekeeper.validateAndMaybeRun({ ctx, toolCall: { name: 'browser.click', arguments: { selector: '#pay', confirmed: true } } });
  assert.equal(response.error.code, 'INVALID_ARGS');
  assert.equal(validateJsonSchema({ type: 'object' }, JSON.parse('{"nested":{"__proto__":{"admin":true}}}')).success, false);
  runtime.confirmations.destroy();
});

test('confirmation executes once, stores immutable args, and survives restart', async () => {
  const filePath = path.join(DATA_DIR, 'confirm-test.json');
  const store = new PendingConfirmationStore({ filePath });
  const ctx = { userId: 'alice', chatId: 'a' };
  const args = { filename: 'safe.txt' };
  const record = store.create({ ctx, tool: { name: 'demo', risk: 'low_write' }, args, summary: 'write safe file' });
  args.filename = 'changed.txt'; record.args.filename = 'changed-again.txt';
  assert.equal(store.get(record.id).args.filename, 'safe.txt');
  const second = new PendingConfirmationStore({ filePath });
  assert.equal(second.get(record.id).status, 'pending'); second.destroy();
  assert.equal(store.decide({ id: record.id, ctx, message: 'confirm' }).status, 'approved');
  assert.equal(store.decide({ id: record.id, ctx, message: 'confirm' }).status, 'already_resolved');
  const third = new PendingConfirmationStore({ filePath });
  assert.equal(third.decide({ id: record.id, ctx, message: 'confirm' }).status, 'already_resolved');
  store.destroy(); third.destroy();
});

test('guardrail exceptions block tool execution', async () => {
  const runtime = createAgentRuntime({ auditPath: false, confirmationPath: false, planPath: false });
  let called = false;
  runtime.registry.register({ name: 'guarded', schema: { type: 'object' }, guardrail: () => { throw new Error('broken'); }, execute: () => { called = true; } });
  const result = await runtime.gatekeeper.validateAndMaybeRun({ ctx: createToolContext(), toolCall: { name: 'guarded', arguments: {} } });
  assert.equal(result.error.code, 'GUARDRAIL_FAILED'); assert.equal(called, false);
  runtime.confirmations.destroy();
});

test('iteration grace is finite and zero disables extra work', () => {
  const budget = new IterationBudget(1, { grace: 0 });
  assert.equal(budget.consume(), true); assert.equal(budget.consume(), false);
  const bad = new IterationBudget(Infinity, { grace: Infinity });
  let calls = 0; while (bad.consume()) { if (++calls > 15) assert.fail('unbounded loop'); }
});

test('agent model turns have a hard cap even when every tool is cheap', async () => {
  let modelTurns = 0;
  const result = await runAgentTurn({
    ctx: { userId: 'u', chatId: 'c', services: { memoryOrchestrator: {} } },
    input: [{ role: 'user', content: 'loop' }],
    maxSteps: 1,
    allowedTools: [],
    callModel: async () => ({
      type: 'tool_calls',
      text: '',
      toolCalls: [{ id: `call-${++modelTurns}`, name: 'calculator.evaluate', arguments: { expression: '1+1' } }]
    }),
    gatekeeper: { validateAndMaybeRun: async () => ({ status: 'executed', result: { value: 2 } }) }
  });
  assert.equal(result.limitReached, true);
  assert.equal(modelTurns, 2, 'one configured turn plus one bounded grace turn');
});

test('agent deadline aborts a stalled model request', async () => {
  let observedAbort = false;
  await assert.rejects(() => runAgentTurn({
    ctx: { services: { memoryOrchestrator: {} } },
    input: [{ role: 'user', content: 'wait forever' }],
    maxSteps: 1,
    turnTimeoutMs: 20,
    allowedTools: [],
    callModel: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { observedAbort = true; reject(new Error('aborted')); }, { once: true });
    }),
    gatekeeper: { validateAndMaybeRun: async () => ({ status: 'blocked' }) }
  }), /timed out/i);
  assert.equal(observedAbort, true);
});

test('artifact root and nested symlink escapes are blocked before writing', async t => {
  const outside = path.join(DATA_DIR, 'outside');
  await fs.mkdir(outside, { recursive: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const chat = path.join(ARTIFACTS_DIR, 'linked');
  try { await fs.symlink(outside, chat, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('OS denied symlink creation'); return; } throw error; }
  const registry = new ToolRegistry(); require('../tools/artifactTool').register(registry);
  const tool = registry.get('artifact.write');
  assert.equal((await tool.execute({ filename: 'escape.txt', content: 'bad' }, { chatId: 'linked' })).ok, false);
  await assert.rejects(() => fs.access(path.join(outside, 'escape.txt')));
  await fs.mkdir(path.join(ARTIFACTS_DIR, 'normal'), { recursive: true });
  await fs.symlink(outside, path.join(ARTIFACTS_DIR, 'normal', 'nested'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await tool.execute({ filename: 'nested/escape.txt', content: 'bad' }, { chatId: 'normal' })).ok, false);
  assert.throws(() => safeSegment('..'));
  assert.notEqual(safeSegment('a/b'), safeSegment('a_b'));
});

test('filesystem tool rejects root secrets, config and cross-chat artifacts', async () => {
  const registry = new ToolRegistry(); require('../tools/fsTool').register(registry);
  for (const input of ['.env.local', '.git/config', 'config/hazy-config.json', 'cache/hazy-engine/artifacts/other/key.txt']) {
    const result = await registry.get('fs.read_file').execute({ path: input }, { chatId: 'own' });
    assert.equal(result.ok, false, input);
  }
});

test('artifact storage is isolated by user and project even with the same chat id', async () => {
  const registry = new ToolRegistry(); require('../tools/artifactTool').register(registry);
  const tool = registry.get('artifact.write');
  const alice = { userId: 'alice', projectId: 'one', chatId: 'shared' };
  const bob = { userId: 'bob', projectId: 'one', chatId: 'shared' };
  assert.equal((await tool.execute({ filename: 'private.txt', content: 'ALICE_ONLY' }, alice)).ok, true);
  const bobList = await tool.execute({ action: 'list' }, bob);
  assert.deepEqual(bobList.data.files, []);
});

test('audit records retain decisions without arbitrary private payloads', () => {
  const audit = new AgentAuditStore();
  const record = audit.log({ toolName: 'test', status: 'blocked', args: { strange: 'PRIVATE_SENTINEL' }, result: { data: 'PRIVATE_SENTINEL' } });
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE_SENTINEL/);
  assert.equal(record.status, 'blocked');
});
