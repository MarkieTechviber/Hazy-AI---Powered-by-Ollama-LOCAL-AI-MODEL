const TEMPLATE_GUIDES = {
  emotional_support_response: [
    "Start with a soft acknowledgment.",
    "Reflect the user's experience in plain language.",
    "Validate proportionally without dramatizing.",
    "Offer one gentle question or one small next step."
  ],
  technical_response: [
    "Lead with the direct answer.",
    "Explain why it works in simple terms.",
    "Use one concrete example.",
    "Mention one common mistake or next step."
  ],
  debugging_response: [
    "Name the symptom.",
    "State the likely cause.",
    "Give the fix in steps.",
    "Include one verification test."
  ],
  planning_response: [
    "Restate the goal.",
    "Break it into phases.",
    "Prioritize the first move.",
    "Give a practical implementation order."
  ],
  celebration_response: [
    "Celebrate briefly and specifically.",
    "Name the effort behind the win.",
    "Channel the momentum into a next step if useful."
  ],
  decision_support_response: [
    "Frame the decision cleanly.",
    "Compare the options simply.",
    "Call out the main tradeoff.",
    "Recommend a path if context allows."
  ],
  clarifying_response: [
    "Reassure the user.",
    "Shrink the concept.",
    "Use one analogy or minimal example.",
    "Check understanding lightly."
  ],
  overwhelm_reduction_response: [
    "Acknowledge the overload.",
    "Reduce scope.",
    "List the top priorities only.",
    "End with the first actionable step."
  ],
  crisis_support_response: [
    "Stay calm and brief.",
    "Encourage immediate human support.",
    "Avoid broad problem-solving.",
    "Use safety-first language."
  ]
};

function planResponse({ strategy, userNeed, toneProfile, memory, ragContext }) {
  const guide = TEMPLATE_GUIDES[strategy.template] || TEMPLATE_GUIDES.technical_response;
  const memoryNotes = (memory || []).slice(0, 3).map((item) => `Memory: ${item.summary || item.value || item}`);
  const ragNotes = (ragContext || []).slice(0, 3).map((item) => `Context: ${item.summary || item.text || item}`);

  return {
    template: strategy.template,
    mode: strategy.mode,
    questionLimit: strategy.questionLimit,
    outline: [
      `Primary user need: ${userNeed}.`,
      `Tone: ${toneProfile.name} - ${toneProfile.sentenceStyle}`,
      ...guide,
      ...memoryNotes,
      ...ragNotes
    ]
  };
}

module.exports = { planResponse, TEMPLATE_GUIDES };
