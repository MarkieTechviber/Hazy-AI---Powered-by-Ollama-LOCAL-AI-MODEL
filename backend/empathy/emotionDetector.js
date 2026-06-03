const { detectIntensity } = require("./intensityDetector");

const EMOTION_RULES = [
  {
    emotion: "confused",
    patterns: [/don't get/i, /\bconfused\b/i, /\blost\b/i, /not clicking/i, /what does .* mean/i],
    userNeed: "simple explanation",
    recommendedMode: "patient_tutor"
  },
  {
    emotion: "frustrated",
    patterns: [/\bstuck\b/i, /for \d+ hours/i, /won't work/i, /\bannoying\b/i, /throw my laptop/i],
    userNeed: "focused fix",
    recommendedMode: "direct_engineer"
  },
  {
    emotion: "sad",
    patterns: [/\bdown\b/i, /feel invisible/i, /passed over again/i, /\bhurt\b/i, /\bsad\b/i],
    userNeed: "validation and gentle support",
    recommendedMode: "calm_supporter"
  },
  {
    emotion: "anxious",
    patterns: [/\bworried\b/i, /\bnervous\b/i, /\bpanic\b/i, /\bspiral/i, /what if/i],
    userNeed: "grounding and clarity",
    recommendedMode: "calm_supporter"
  },
  {
    emotion: "excited",
    patterns: [/\bfinally\b/i, /let's go/i, /so pumped/i, /!!!+/i],
    userNeed: "celebration and momentum",
    recommendedMode: "excited_collaborator"
  },
  {
    emotion: "proud",
    patterns: [/\bproud\b/i, /\bI did it\b/i, /\bshipped\b/i, /\bfinished\b/i],
    userNeed: "recognition and momentum",
    recommendedMode: "excited_collaborator"
  },
  {
    emotion: "angry",
    patterns: [/\bgarbage\b/i, /\bhate this\b/i, /\bridiculous\b/i, /\bbullshit\b/i, /\bangry\b/i],
    userNeed: "de-escalated action path",
    recommendedMode: "calm_supporter"
  },
  {
    emotion: "overwhelmed",
    patterns: [/too much/i, /can't keep up/i, /brain is fried/i, /overwhelmed/i],
    userNeed: "simplification and prioritization",
    recommendedMode: "low_energy_soft"
  },
  {
    emotion: "curious",
    patterns: [/how does/i, /why does/i, /what's the difference/i, /\binterested in\b/i, /\bcurious\b/i],
    userNeed: "exploration and explanation",
    recommendedMode: "warm_clear"
  }
];

function detectEmotion(message = "") {
  const text = String(message);
  const intensity = detectIntensity(text);

  let bestMatch = null;
  for (const rule of EMOTION_RULES) {
    const matched = rule.patterns.filter((pattern) => pattern.test(text));
    if (!matched.length) continue;

    const score = matched.length;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        emotion: rule.emotion,
        score,
        userNeed: rule.userNeed,
        recommendedMode: rule.recommendedMode,
        signals: matched.map(String)
      };
    }
  }

  return {
    emotion: bestMatch?.emotion || "neutral",
    intensity: intensity.intensity,
    userNeed: bestMatch?.userNeed || "clear helpful response",
    recommendedMode: bestMatch?.recommendedMode || "warm_clear",
    confidence: bestMatch ? Math.min(0.55 + bestMatch.score * 0.14, 0.95) : 0.45,
    signals: [...(bestMatch?.signals || []), ...intensity.signals]
  };
}

module.exports = { detectEmotion, EMOTION_RULES };
