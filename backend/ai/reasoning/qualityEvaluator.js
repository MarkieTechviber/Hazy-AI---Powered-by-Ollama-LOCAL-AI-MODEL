'use strict';

const { verifyVisibleEquations } = require('./calculator');

function evaluateReasoningResponse(response, task = {}) {
  const text = String(response || '').trim();
  const issues = [];
  const equations = task.shouldUseCalculator ? verifyVisibleEquations(text) : [];
  const invalidEquations = equations.filter((item) => !item.valid);

  if (!text) issues.push('empty_response');
  if (/<\s*thinking\b/i.test(text)) issues.push('private_reasoning_exposed');
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

module.exports = {
  evaluateReasoningResponse,
  majorityVote
};
