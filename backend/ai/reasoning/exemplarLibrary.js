'use strict';

const EXEMPLARS = Object.freeze({
  math: [
    {
      question: 'A shop has 18 notebooks, receives 12 more, then sells 9. How many remain?',
      method: 'Combine the starting amount and delivery, then subtract the sold amount: (18 + 12) - 9.',
      answer: '21'
    },
    {
      question: 'Five tickets cost 7 dollars each. What is the total cost?',
      method: 'Multiply the number of tickets by the price per ticket: 5 * 7.',
      answer: '35 dollars'
    }
  ],
  commonsense: [
    {
      question: 'Which is better for drying wet hands: a towel or a glass cup?',
      method: 'Compare the relevant property. A towel absorbs water; a glass cup does not.',
      answer: 'A towel'
    },
    {
      question: 'If a road is closed, should a driver continue through the barrier or use a marked detour?',
      method: 'Apply the safety constraint and choose the permitted route.',
      answer: 'Use the marked detour'
    }
  ],
  symbolic: [
    {
      question: 'Take the last letters of "Ada Lovelace" and join them.',
      method: 'The last letters are "a" and "e"; preserve their order and concatenate them.',
      answer: 'ae'
    },
    {
      question: 'A coin starts heads-up and is flipped three times. Which side is up?',
      method: 'Each flip toggles the side: heads to tails, tails to heads, heads to tails.',
      answer: 'Tails'
    }
  ],
  coding: [
    {
      question: 'A form submits twice after a component rerenders. What should be checked?',
      method: 'Trace event-listener registration, confirm cleanup, reproduce once, patch the duplicate registration, then verify with a focused test.',
      answer: 'Remove the duplicate listener or add correct cleanup'
    }
  ],
  general: [
    {
      question: 'Compare two options with different costs and benefits.',
      method: 'State the decision criteria, compare each option against the same criteria, note uncertainty, and give a concise recommendation.',
      answer: 'Choose the option that best satisfies the stated criteria'
    }
  ]
});

function getExemplars(taskType, count = 2) {
  const source = EXEMPLARS[taskType] || EXEMPLARS.general;
  const limit = Math.max(0, Math.min(Number(count) || 0, source.length));
  return source.slice(0, limit).map((item) => ({ ...item }));
}

function formatExemplars(taskType, count = 2) {
  return getExemplars(taskType, count)
    .map((example, index) => [
      `Example ${index + 1}`,
      `Question: ${example.question}`,
      `Method summary: ${example.method}`,
      `Final answer: ${example.answer}`
    ].join('\n'))
    .join('\n\n');
}

module.exports = {
  getExemplars,
  formatExemplars
};
