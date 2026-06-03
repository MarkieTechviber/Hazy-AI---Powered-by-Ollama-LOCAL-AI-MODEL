const { CRISIS_PATTERNS } = require("./intensityDetector");

const DEPENDENCY_PATTERNS = [
  /\byou are all I need\b/i,
  /\bonly you understand me\b/i,
  /\bdon't leave me\b/i
];

function detectSafety(message = "") {
  const text = String(message);
  const flags = [];
  let riskLevel = "tier_0";

  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) {
    riskLevel = "tier_3";
    flags.push("crisis_language");
  } else if (/\b(hurt them|kill them|make them pay)\b/i.test(text)) {
    riskLevel = "tier_3";
    flags.push("violence_language");
  } else if (/\b(pointless|no reason to live|can't go on)\b/i.test(text)) {
    riskLevel = "tier_2";
    flags.push("severe_hopelessness");
  } else if (DEPENDENCY_PATTERNS.some((pattern) => pattern.test(text))) {
    riskLevel = "tier_1";
    flags.push("dependency_cue");
  }

  return {
    riskLevel,
    flags,
    requiresEscalation: riskLevel === "tier_2" || riskLevel === "tier_3",
    shouldSuppressNormalStyle: riskLevel === "tier_3"
  };
}

module.exports = { detectSafety };
