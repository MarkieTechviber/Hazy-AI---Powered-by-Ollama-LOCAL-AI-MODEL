'use strict';

const { formatExemplars } = require('./exemplarLibrary');

function buildTaskReasoningGuidance(task = {}) {
  if (!task.shouldUseReasoning) {
    return [
      'Task-aware reasoning:',
      `- Category: ${task.taskType || 'general'}`,
      '- This appears to be a simple request. Answer directly without unnecessary intermediate work.'
    ].join('\n');
  }

  const domainRules = {
    math: [
      '- Identify the quantities and requested value.',
      '- Form the needed operations before calculating.',
      '- Check every visible equation and state the final answer with units.'
    ],
    symbolic: [
      '- Track each symbol transformation in order.',
      '- Recheck the final sequence against the original input.'
    ],
    commonsense: [
      '- Identify the practical constraint that decides the answer.',
      '- Compare plausible alternatives and avoid inventing facts.'
    ],
    coding: [
      '- Inspect the relevant context, identify the likely cause, make the smallest complete change, and verify behavior.'
    ],
    general: [
      '- Break the request into its decision criteria or dependent parts.',
      '- Resolve each part before writing the conclusion.'
    ]
  };
  const exemplars = formatExemplars(task.taskType, task.complexity === 'complex' ? 2 : 1);

  return [
    'Task-aware reasoning:',
    `- Category: ${task.taskType}`,
    `- Complexity: ${task.complexity}`,
    `- Calculator check: ${task.shouldUseCalculator ? 'required for visible arithmetic' : 'not required'}`,
    `- Self-consistency: ${task.selfConsistencyRecommended ? 'recommended when multiple samples are available' : 'not needed'}`,
    ...(domainRules[task.taskType] || domainRules.general),
    '- Do the detailed reasoning privately. Show only a concise explanation or verifiable calculation, never hidden scratchpad or raw chain-of-thought.',
    exemplars ? `\nWorked-format examples:\n${exemplars}` : ''
  ].filter(Boolean).join('\n');
}

module.exports = { buildTaskReasoningGuidance };
