const { SUPPORT_PRINCIPLES, getHumanSupportGuide } = require("./humanEmotionalSupport");

const TEMPLATE_GUIDES = {
  companion_conversation_response: [
    "Respond to the person, not just the literal request.",
    "Continue the conversational thread naturally.",
    "Offer help only when it fits instead of forcing a task structure.",
    "Leave room for warmth, humor, reflection, or simple presence."
  ],
  emotional_support_response: [
    "Start with presence and validation only. Sit in it with them first.",
    "Use short, natural fragments and contractions. Match their low energy.",
    "Acknowledge the weight without solutions, silver linings, or rushing to fix.",
    "End with quiet presence or a very light invitation to keep talking if it fits. No forced questions."
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
    "Acknowledge the overload and validate how much it is to carry right now.",
    "Reduce scope gently. Give permission to not figure it all out immediately.",
    "Keep it very short and low-energy. Match their drained state.",
    "One small next thing only if it feels natural — presence first."
  ],
  crisis_support_response: [
    "Stay calm, short, and human. Lead with genuine presence ('I'm really glad you told me').",
    "Acknowledge how heavy it is without drama. Focus on getting through right now / tonight.",
    "Strongly encourage real human support (988 or trusted person) but after the human connection, not as the first cold line.",
    "Use the dark_thoughts supportGuide rules: validate, personal pronouns, short, no judgment, 'I want you here' energy."
  ]
};

function planResponse({ strategy, userNeed, toneProfile, memory, ragContext }) {
  const guide = TEMPLATE_GUIDES[strategy.template] || TEMPLATE_GUIDES.companion_conversation_response;
  const memoryNotes = (memory || []).slice(0, 3).map((item) => `Memory: ${item.summary || item.value || item}`);
  const ragNotes = (ragContext || []).slice(0, 3).map((item) => `Context: ${item.summary || item.text || item}`);

  // Pull raw human emotional support data if the strategy provided it (from empathyPolicy)
  // or compute it here. This is what makes HAZY *think* according to real companion patterns
  // instead of filtered AI defaults.
  const supportGuide = strategy.supportGuide || getHumanSupportGuide(
    // best-effort reconstruction if not passed
    null, // emotion not directly here, but guide was already selected upstream
    null,
    "low"
  );

  // Build human support directive from raw data (principles + situation rules)
  const humanSupportDirective = supportGuide ? {
    principles: SUPPORT_PRINCIPLES.map(p => p.rule),
    situation: {
      vibe: supportGuide.vibe,
      firstMove: supportGuide.firstMove,
      languageRules: supportGuide.languageRules,
      avoid: supportGuide.avoid,
      presenceFocus: supportGuide.presenceFocus,
      allowVenting: supportGuide.allowVenting
    },
    note: "Follow these exact principles and situation rules. Validate first. Use contractions and short fragments. Match energy. Sit with them. No rushed solutions or clinical language."
  } : null;

  const outline = [
    `Primary user need: ${userNeed}.`,
    `Tone: ${toneProfile.name} - ${toneProfile.sentenceStyle}`,
    ...guide,
    ...(humanSupportDirective ? [
      "--- HUMAN EMOTIONAL SUPPORT DIRECTIVE (raw data logic) ---",
      `Vibe to embody: ${humanSupportDirective.situation.vibe}`,
      `First move: ${humanSupportDirective.situation.firstMove}`,
      `Language rules (must follow): ${humanSupportDirective.situation.languageRules.join(" | ")}`,
      `Strictly avoid: ${humanSupportDirective.situation.avoid.join(" | ")}`,
      `Core principles: ${humanSupportDirective.principles.join(" || ")}`,
      humanSupportDirective.note
    ] : []),
    ...memoryNotes,
    ...ragNotes
  ];

  return {
    template: strategy.template,
    mode: strategy.mode,
    questionLimit: strategy.questionLimit,
    supportGuide: supportGuide,           // raw data available to generator
    humanSupportDirective,                // ready-to-inject instructions
    outline
  };
}

module.exports = { planResponse, TEMPLATE_GUIDES };
