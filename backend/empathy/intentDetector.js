const INTENT_RULES = [
  { intent: "debugging", patterns: [/\berror\b/i, /\bbug\b/i, /\bstack trace\b/i, /\bcrash\b/i, /\bfailing\b/i, /won't work/i] },
  { intent: "technical_question", patterns: [/how do/i, /what is/i, /why does/i, /difference between/i, /how does/i, /\b(?:can you|could you|please)\s+explain\b/i] },
  { intent: "planning", patterns: [/\bplan\b/i, /\broadmap\b/i, /\barchitecture\b/i, /how should I structure/i, /implementation order/i] },
  { intent: "creative_help", patterns: [/\bbrainstorm\b/i, /name ideas/i, /\bcopy\b/i, /design ideas/i, /creative help/i] },
  { intent: "decision_making", patterns: [/should I/i, /which is better/i, /choose between/i, /worth it/i, /decide/i] },
  { intent: "venting", patterns: [/just needed to vent/i, /this sucks/i, /I'm so tired of/i, /I hate this/i] },
  { intent: "emotional_support", patterns: [/I feel/i, /I'm struggling/i, /this is hard/i, /I feel invisible/i] },
  { intent: "direct_answer", patterns: [/no fluff/i, /just tell me/i, /short answer/i, /be direct/i] },
  { intent: "celebration", patterns: [/\bfinally\b/i, /\bI did it\b/i, /good news/i, /test to pass/i, /\bshipped\b/i] },
  { intent: "expressing_confusion", patterns: [/don't get/i, /\bconfused\b/i, /\blost\b/i, /not clicking/i] }
];

function detectIntent(message = "") {
  const text = String(message);
  let best = { primaryIntent: "general_conversation", score: 0 };

  for (const rule of INTENT_RULES) {
    const matched = rule.patterns.filter((pattern) => pattern.test(text));
    if (matched.length > best.score) {
      best = { primaryIntent: rule.intent, score: matched.length, signals: matched.map(String) };
    }
  }

  const secondaryIntent = [];
  for (const rule of INTENT_RULES) {
    if (rule.intent === best.primaryIntent) continue;
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      secondaryIntent.push(rule.intent);
    }
  }

  return {
    primaryIntent: best.primaryIntent,
    secondaryIntent: secondaryIntent.slice(0, 2),
    directnessPreference: /\b(no fluff|just tell me|brief|short answer)\b/i.test(text) ? "high" : "balanced",
    needsAnswer: !["venting", "celebration"].includes(best.primaryIntent),
    needsValidation: ["venting", "emotional_support", "expressing_confusion", "debugging", "celebration"].includes(best.primaryIntent),
    confidence: best.score ? Math.min(0.58 + best.score * 0.12, 0.95) : 0.48,
    signals: best.signals || []
  };
}

module.exports = { detectIntent, INTENT_RULES };
