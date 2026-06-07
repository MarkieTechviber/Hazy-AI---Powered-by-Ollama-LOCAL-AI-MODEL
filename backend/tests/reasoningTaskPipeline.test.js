'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyReasoningTask } = require('../ai/reasoning/taskClassifier');
const { getExemplars, formatExemplars } = require('../ai/reasoning/exemplarLibrary');
const { buildTaskReasoningGuidance } = require('../ai/reasoning/reasoningPrompt');
const { evaluateArithmetic, verifyVisibleEquations } = require('../ai/reasoning/calculator');
const { evaluateReasoningResponse, majorityVote } = require('../ai/reasoning/qualityEvaluator');

test('classifies multi-step math and enables calculator verification', () => {
  const result = classifyReasoningTask(
    'Mia has 12 apples, buys 8 more, then gives 5 away. How many are left?'
  );

  assert.equal(result.taskType, 'math');
  assert.equal(result.multiStep, true);
  assert.equal(result.shouldUseCalculator, true);
});

test('keeps one-step arithmetic direct', () => {
  const result = classifyReasoningTask('What is 2 + 2?');

  assert.equal(result.taskType, 'math');
  assert.equal(result.multiStep, false);
  assert.equal(result.shouldUseReasoning, false);
});

test('provides immutable task-specific exemplars', () => {
  const first = getExemplars('symbolic', 1);
  first[0].answer = 'changed';
  const second = getExemplars('symbolic', 1);

  assert.notEqual(second[0].answer, 'changed');
  assert.match(formatExemplars('symbolic', 1), /Method summary:/);
});

test('builds private-reasoning-safe task guidance', () => {
  const task = classifyReasoningTask(
    'A store has 10 items, adds 8, then sells 3. How many remain?'
  );
  const prompt = buildTaskReasoningGuidance(task);

  assert.match(prompt, /Category: math/);
  assert.match(prompt, /Calculator check: required/);
  assert.match(prompt, /never hidden scratchpad or raw chain-of-thought/i);
});

test('safe calculator handles precedence and parentheses without eval', () => {
  assert.equal(evaluateArithmetic('(18 + 12) - 9'), 21);
  assert.equal(evaluateArithmetic('2 + 3 * 4'), 14);
  assert.throws(() => evaluateArithmetic('process.exit()'), /Unsupported/);
});

test('visible equation verifier catches arithmetic mismatches', () => {
  const checks = verifyVisibleEquations('First 18 + 12 = 30. Then 30 - 9 = 20.');

  assert.equal(checks.length, 2);
  assert.equal(checks[0].valid, true);
  assert.equal(checks[1].valid, false);
});

test('quality evaluator reports calculator errors', () => {
  const task = classifyReasoningTask(
    'A store has 10 items, adds 8, then sells 3. How many remain?'
  );
  const result = evaluateReasoningResponse(
    'There are 10 + 8 = 18 items, then 18 - 3 = 14 items. Final answer: 14.',
    task
  );

  assert.equal(result.valid, false);
  assert.ok(result.issues.includes('calculator_mismatch'));
});

test('majority vote normalizes punctuation and reports agreement', () => {
  const result = majorityVote(['21', '21.', ' 21 ', '20']);

  assert.equal(result.answer, '21');
  assert.equal(result.votes, 3);
  assert.equal(result.total, 4);
  assert.equal(result.agreement, 0.75);
});
