'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { reviewResponse } = require('../ai/responseReviewer');

test('reviewResponse strips raw thinking blocks from visible output', () => {
  const result = reviewResponse(
    '<thinking>private scratchpad should never show</thinking>\nHere is the final answer.',
    { intent: 'direct_answer', taskType: 'general' }
  );

  assert.equal(result.response, 'Here is the final answer.');
  assert.equal(result.issues.includes('private_reasoning_exposed'), true);
});

test('reviewResponse strips multiple thinking blocks without removing public text between them', () => {
  const result = reviewResponse(
    'Start. <thinking>one</thinking> Keep this. <thinking>two</thinking> End.',
    { intent: 'direct_answer', taskType: 'general' }
  );

  assert.equal(result.response, 'Start.  Keep this.  End.');
  assert.equal(result.issues.includes('private_reasoning_exposed'), true);
});

test('reviewResponse strips malformed spaced thinking tags', () => {
  const result = reviewResponse(
    '< thinking >private scratchpad</ thinking >Visible answer.',
    { intent: 'direct_answer', taskType: 'general' }
  );

  assert.equal(result.response, 'Visible answer.');
  assert.equal(result.issues.includes('private_reasoning_exposed'), true);
});

test('reviewResponse strips nested thinking blocks completely', () => {
  const result = reviewResponse(
    '<thinking>outer <thinking>inner</thinking> still private</thinking>Final.',
    { intent: 'direct_answer', taskType: 'general' }
  );

  assert.equal(result.response, 'Final.');
  assert.doesNotMatch(result.response, /outer|inner|private/i);
});

test('reviewResponse strips unclosed thinking block to prevent scratchpad leaks', () => {
  const result = reviewResponse(
    'Visible. <thinking>private scratchpad with no close',
    { intent: 'direct_answer', taskType: 'general' }
  );

  assert.equal(result.response, 'Visible.');
  assert.doesNotMatch(result.response, /private scratchpad/i);
});

test('reviewResponse attaches arithmetic quality checks for math tasks', () => {
  const result = reviewResponse(
    'Add first: 12 + 8 = 20. Subtract next: 20 - 5 = 14. Final answer: 14.',
    {
      intent: 'direct_answer',
      taskType: 'math',
      reasoningTask: {
        taskType: 'math',
        shouldUseReasoning: true,
        shouldUseCalculator: true
      }
    }
  );

  assert.equal(result.reasoningQuality.valid, false);
  assert.ok(result.issues.includes('calculator_mismatch'));
});
