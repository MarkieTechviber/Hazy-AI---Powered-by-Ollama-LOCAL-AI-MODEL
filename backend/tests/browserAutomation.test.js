'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyUrl, redactObject, requiresConfirmation } = require('../browser/browserSafety');
const { createAgentRuntime, createToolContext } = require('../agent/agentRuntime');

test('browser safety blocks file, localhost, and private network targets by default', () => {
  assert.equal(classifyUrl('file:///C:/secret.txt').allowed, false);
  assert.equal(classifyUrl('http://localhost:3000').allowed, false);
  assert.equal(classifyUrl('http://127.0.0.1:8080').allowed, false);
  assert.equal(classifyUrl('http://192.168.1.10').allowed, false);
  assert.equal(classifyUrl('https://example.com').allowed, true);
});

test('browser safety requires confirmation for personal data and secret entry', () => {
  const email = requiresConfirmation({ type: 'type', selector: 'input[name="email"]', text: 'person@example.com' });
  const token = requiresConfirmation({ type: 'type', selector: '#apiKey', text: 'sk-test-secret' });
  assert.equal(email.required, true);
  assert.equal(email.code, 'PERSONAL_DATA_CONFIRMATION');
  assert.equal(token.required, true);
  assert.equal(token.code, 'SENSITIVE_INPUT_CONFIRMATION');
});

test('browser safety requires confirmation for form and purchase clicks', () => {
  const submit = requiresConfirmation(
    { type: 'click', selector: 'button[type="submit"]', text: 'Submit' },
    { visibleTextSummary: 'Create account' }
  );
  const purchase = requiresConfirmation(
    { type: 'click', selector: 'text=Place order', text: 'Place order' },
    { visibleTextSummary: 'Checkout billing payment' }
  );
  assert.equal(submit.required, true);
  assert.equal(purchase.required, true);
});

test('browser log redaction removes secret values', () => {
  const redacted = redactObject({
    selector: '#apiKey',
    value: 'sk-real-secret-value',
    nested: { password: 'abc123' }
  });
  assert.equal(redacted.value, '[REDACTED]');
  assert.equal(redacted.nested.password, '[REDACTED]');
});

test('browser tools are registered for the agent gatekeeper', () => {
  const runtime = createAgentRuntime({ auditPath: false, confirmationPath: false, planPath: false });
  const ctx = createToolContext({ enabledToolsets: ['browser'] });
  const tools = runtime.registry.list(ctx);
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes('browser.open'));
  assert.ok(names.includes('browser.observe'));
  assert.ok(names.includes('browser.ask_user'));
  assert.equal(tools.find((tool) => tool.name === 'browser.click').requiresConfirmation, true);
  assert.equal(tools.find((tool) => tool.name === 'browser.type').requiresConfirmation, true);
});
