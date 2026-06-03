const CRISIS_PATTERNS = [
  /\bkill myself\b/i,
  /\bhurt myself\b/i,
  /\bend it\b/i,
  /\bdon't want to live\b/i,
  /\bsuicide\b/i
];

function detectIntensity(message = "") {
  const text = String(message);

  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intensity: "crisis",
      score: 100,
      signals: ["crisis_language"]
    };
  }

  let score = 0;
  const signals = [];

  if (/[A-Z]{4,}/.test(text)) {
    score += 20;
    signals.push("all_caps");
  }

  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 3) {
    score += 12;
    signals.push("repeated_exclamation");
  }

  const questions = (text.match(/\?/g) || []).length;
  if (questions >= 3) {
    score += 8;
    signals.push("repeated_questions");
  }

  if (/\b(urgent|asap|right now|immediately)\b/i.test(text)) {
    score += 14;
    signals.push("urgency_language");
  }

  if (/\b(again|still|finally)\b/i.test(text) || /for \d+\s+(hours?|days?)/i.test(text)) {
    score += 10;
    signals.push("time_pressure");
  }

  if (/\b(staring at this|throw my laptop|can't keep doing this)\b/i.test(text)) {
    score += 12;
    signals.push("frustration_escalation");
  }

  if (/\b(spiral|meltdown|losing it|can't do this|done with this)\b/i.test(text)) {
    score += 18;
    signals.push("escalation_language");
  }

  if (/\b(fuck|shit|garbage|bullshit|hate this)\b/i.test(text)) {
    score += 14;
    signals.push("strong_negative_language");
  }

  if (score >= 45) {
    return { intensity: "high", score, signals };
  }

  if (score >= 18) {
    return { intensity: "medium", score, signals };
  }

  return { intensity: "low", score, signals };
}

module.exports = { detectIntensity, CRISIS_PATTERNS };
