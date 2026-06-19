'use strict';

const { verifyVisibleEquations } = require('./calculator');

function evaluateReasoningResponse(response, task = {}) {
  const text = String(response || '').trim();
  const issues = [];
  const equations = task.shouldUseCalculator ? verifyVisibleEquations(text) : [];
  const invalidEquations = equations.filter((item) => !item.valid);

  if (!text) issues.push('empty_response');
  const isDeepThink = task.reasoningMode === 'deep';
  const isAgentic = task.agentEnabled === true;
  if (!isDeepThink && !isAgentic && /<\s*thinking\b/i.test(text)) {
    issues.push('private_reasoning_exposed');
  }
  if (invalidEquations.length) issues.push('calculator_mismatch');
  if (task.shouldUseReasoning && text.length < 40) issues.push('insufficient_explanation');

  const score = Math.max(0, 100
    - (issues.includes('empty_response') ? 100 : 0)
    - (issues.includes('private_reasoning_exposed') ? 40 : 0)
    - (invalidEquations.length * 25)
    - (issues.includes('insufficient_explanation') ? 15 : 0));

  return {
    score,
    valid: issues.length === 0,
    issues,
    equationChecks: equations
  };
}

function normalizeVote(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

function majorityVote(answers = []) {
  const counts = new Map();
  const originals = new Map();

  for (const answer of answers) {
    const normalized = normalizeVote(answer);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
    if (!originals.has(normalized)) originals.set(normalized, String(answer).trim());
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { answer: '', votes: 0, total: 0, agreement: 0 };
  }
  const [winner, votes] = ranked[0];
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return {
    answer: originals.get(winner),
    votes,
    total,
    agreement: total ? votes / total : 0
  };
}

// FIX #3 — selfConsistencyRecommended was flagged in taskClassifier and
// surfaced in reasoningController but majorityVote() was never wired up
// to anything. This helper is the missing bridge.
// Phase 2: evaluateReasoningResponse + runSelfConsistency now callable from inside agent loop via getLoopReviewers.
//
// Usage in your orchestrator:
//
//   if (profile.selfConsistencyRecommended) {
//     const result = await runSelfConsistency(profile, callModelFn, task);
//     // use result.answer, result.agreement, result.evaluations
//   }
//
// callModelFn must be an async function that accepts no arguments and
// returns the raw string response from whichever provider is active.
// sampleCount defaults to 3 — enough for majority vote without tripling
// token cost on every request.
async function runSelfConsistency(profile, callModelFn, task = {}, sampleCount = 3) {
  if (typeof callModelFn !== 'function') {
    throw new TypeError('callModelFn must be an async function that calls the model');
  }

  const count = Math.max(2, Math.min(Number(sampleCount) || 3, 5));
  const samples = [];
  const evaluations = [];

  for (let i = 0; i < count; i++) {
    let response;
    try {
      response = await callModelFn();
    } catch (err) {
      // Partial failure is acceptable — vote on whatever we have
      continue;
    }
    const evaluation = evaluateReasoningResponse(response, task);
    samples.push(response);
    evaluations.push(evaluation);
  }

  if (!samples.length) {
    return {
      answer: '',
      votes: 0,
      total: 0,
      agreement: 0,
      evaluations: [],
      selfConsistencyUsed: true,
      samplesCollected: 0
    };
  }

  // Extract the final answer portion from each sample for voting.
  // Models typically put their answer after "Answer:" or on the last line.
  const extractAnswer = (text) => {
    const answerMatch = /(?:answer\s*:\s*|therefore[,:]?\s*|result\s*:\s*)(.+)/i.exec(text);
    if (answerMatch) return answerMatch[1].trim();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || text.trim();
  };

  const candidates = samples.map(extractAnswer);
  const vote = majorityVote(candidates);

  // Return the full sample that best matches the winning answer so the
  // caller gets both the extracted answer and the full reasoning.
  const bestIndex = candidates.findIndex(
    (c) => normalizeVote(c) === normalizeVote(vote.answer)
  );
  const bestFullResponse = bestIndex >= 0 ? samples[bestIndex] : samples[0];

  return {
    ...vote,
    fullResponse: bestFullResponse,
    evaluations,
    selfConsistencyUsed: true,
    samplesCollected: samples.length
  };
}

module.exports = {
  evaluateReasoningResponse,
  majorityVote,
  runSelfConsistency
};
