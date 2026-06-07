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
  const confidence = Math.min(98, bestScore === 0 ? 35 : 55 + (bestScore * 12));

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
