'use strict';

const TASK_TYPES = new Set(['math', 'commonsense', 'symbolic', 'coding', 'general']);

const SIGNALS = {
  math: [
    /\bhow many\b/i,
    /\b(total|sum|difference|product|quotient|percent|percentage|average|calculate|compute)\b/i,
    /\b(cost|price|discount|tax|profit|distance|speed|miles?|kilometers?|hours?|minutes?)\b/i,
    /(?:^|\s)\$?\d+(?:\.\d+)?\s*(?:[+\-*/x×÷=]|percent|%)/i
  ],
  symbolic: [
    /\b(first|last)\s+letters?\b/i,
    /\b(concatenate|sequence|pattern|anagram|cipher|encode|decode)\b/i,
    /\b(coin|coins)\b.*\b(heads?|tails?|flip|flips|flipped)\b/i,
    /\b(move|swap|reverse|rotate)\b.*\b(letter|character|symbol|token)s?\b/i
  ],
  coding: [
    /\b(code|coding|program|function|class|api|bug|error|stack trace|repository|refactor|implement)\b/i,
    /\b(javascript|typescript|python|java|react|node|html|css|sql|rust|go|c\+\+|c#)\b/i
  ],
  commonsense: [
    /\b(why|should|would|could|plausible|likely|reasonable|makes sense)\b/i,
    /\bwhat (?:would|should|might)\b/i,
    /\bwhich (?:choice|option|place|item)\b/i
  ]
};

const MULTI_STEP_SIGNALS = [
  /\b(first|then|after|before|finally|each|per|remaining|left|combined)\b/i,
  /\b(and then|followed by|in total|altogether|compared with)\b/i,
  /\b(explain|analyze|compare|derive|prove|plan|debug|refactor|implement)\b/i,
  /\b(if|unless|while|given that|assuming)\b/i
];

const SIMPLE_SIGNALS = [
  /^\s*what is\s+\d+(?:\.\d+)?\s*[+\-*/x×÷]\s*\d+(?:\.\d+)?\s*\??\s*$/i,
  /^\s*(define|translate|spell|name|list)\b/i
];

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

function normalizeTaskType(value) {
  return TASK_TYPES.has(value) ? value : 'general';
}

// FIX #4 — The original confidence formula was purely linear:
// 55 + (bestScore * 12). This meant a message like "what is Python"
// and "rewrite my entire auth system in TypeScript" could score the same
// confidence because both matched 3 coding signals. The new formula
// accounts for:
//   1. Signal spread  — how much the winner beats the runner-up
//   2. Text length    — longer, more specific requests earn higher confidence
//   3. Hard cap       — keeps us honest; we never claim >92% on heuristics
function computeConfidence(scores, bestType, bestScore, text) {
  if (bestScore === 0) return 35;

  const ranked = Object.entries(scores)
    .filter(([type]) => type !== 'general')
    .sort((a, b) => b[1] - a[1]);

  const runnerUpScore = ranked[1]?.[1] ?? 0;
  const spread = bestScore - runnerUpScore; // 0 = ambiguous, higher = clearer

  // Base confidence from raw signal count
  let base = 50 + bestScore * 10;

  // Reward clear separation from nearest rival
  base += spread * 6;

  // Longer, more specific messages earn a small boost (up to +8)
  const lengthBonus = Math.min(8, Math.floor(text.length / 40));
  base += lengthBonus;

  // Penalise ambiguity: if runner-up is only 1 below winner it's noisy
  if (spread <= 1 && bestScore <= 2) base -= 10;

  return Math.min(92, Math.max(35, Math.round(base)));
}

function classifyReasoningTask(question, hints = {}) {
  const text = String(question || '').trim();
  const scores = {
    math: countMatches(text, SIGNALS.math),
    commonsense: countMatches(text, SIGNALS.commonsense),
    symbolic: countMatches(text, SIGNALS.symbolic),
    coding: countMatches(text, SIGNALS.coding),
    general: 0
  };

  if (hints.isCodingRequest) scores.coding += 3;

  const ranked = Object.entries(scores)
    .filter(([type]) => type !== 'general')
    .sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = ranked[0] || ['general', 0];
  const taskType = bestScore > 0 ? bestType : 'general';

  const explicitSimple = SIMPLE_SIGNALS.some((pattern) => pattern.test(text));
  const structuralSteps = countMatches(text, MULTI_STEP_SIGNALS);
  const numericTerms = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const sentenceCount = text.split(/[.!?]+/).filter((part) => part.trim()).length;

  const multiStep = !explicitSimple && (
    structuralSteps >= 1
    || (taskType === 'math' && numericTerms.length >= 3)
    || (taskType === 'coding' && text.length >= 45)
    || sentenceCount >= 3
  );

  const complex = multiStep && (
    structuralSteps >= 2
    || numericTerms.length >= 5
    || text.length >= 180
    || /\b(high[- ]stakes|critical|production|security|financial|medical|legal)\b/i.test(text)
  );

  // FIX #4 — use improved confidence formula
  const confidence = computeConfidence(scores, bestType, bestScore, text);

  return {
    taskType: normalizeTaskType(taskType),
    confidence,
    multiStep,
    complexity: complex ? 'complex' : multiStep ? 'multi_step' : 'simple',
    shouldUseReasoning: multiStep,
    shouldUseCalculator: taskType === 'math' && numericTerms.length >= 2,
    selfConsistencyRecommended: complex
  };
}

module.exports = {
  classifyReasoningTask,
  normalizeTaskType
};
