const { getHumanSupportGuide } = require("./humanEmotionalSupport");

function selectEmpathyStrategy({ emotion, intent, intensity, safety }) {
  if (safety?.riskLevel === "tier_3") {
    const guide = getHumanSupportGuide(emotion, safety, intensity);
    return {
      mode: "calm_supporter",
      template: "crisis_support_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "brief",
      questionLimit: 1,
      reviewMode: "strict",
      supportGuide: guide   // raw human emotional support data injected
    };
  }

  // Emotion-driven default modes (sourced from emotionDetector's recommendations)
  // This fixes the previous disconnect where emotion.recommendedMode was ignored in most cases.
  const emotionDefaultModes = {
    confused: "patient_tutor",
    frustrated: "direct_engineer",
    sad: "calm_supporter",
    anxious: "calm_supporter",
    excited: "excited_collaborator",
    proud: "excited_collaborator",
    angry: "calm_supporter",
    overwhelmed: "low_energy_soft",
    curious: "warm_clear"
  };

  const strategies = {
    "confused:technical_question": {
      mode: "patient_tutor",
      template: "technical_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: true,
      explanationDepth: "simple",
      questionLimit: 1
    },
    "confused:expressing_confusion": {
      mode: "patient_tutor",
      template: "clarifying_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: true,
      explanationDepth: "simple",
      questionLimit: 1
    },
    "frustrated:debugging": {
      mode: "direct_engineer",
      template: "debugging_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "focused",
      questionLimit: 1
    },
    "sad:venting": {
      mode: "calm_supporter",
      template: "emotional_support_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "gentle",
      questionLimit: 1
    },
    "anxious:decision_making": {
      mode: "warm_clear",
      template: "decision_support_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "balanced",
      questionLimit: 1
    },
    "excited:celebration": {
      mode: "excited_collaborator",
      template: "celebration_response",
      empathyLead: true,
      validateFirst: false,
      useAnalogy: false,
      explanationDepth: "light",
      questionLimit: 1
    },
    "overwhelmed:planning": {
      mode: "low_energy_soft",
      template: "overwhelm_reduction_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "simple",
      questionLimit: 1
    },
    "curious:technical_question": {
      mode: "warm_clear",
      template: "technical_response",
      empathyLead: false,
      validateFirst: false,
      useAnalogy: true,
      explanationDepth: "balanced",
      questionLimit: 1
    }
  };

  const fallbackTemplate = {
    general_conversation: "companion_conversation_response",
    venting: "emotional_support_response",
    emotional_support: "emotional_support_response",
    celebration: "celebration_response",
    planning: "planning_response",
    decision_making: "decision_support_response",
    expressing_confusion: "clarifying_response",
    debugging: "debugging_response",
    creative_help: "companion_conversation_response",
    technical_question: "technical_response",
    direct_answer: "technical_response"
  };
  // Dynamic question limit to reduce hardcoding: fewer questions when high intensity or crisis risk
  const dynamicQuestionLimit = (intensity === "high" || intensity === "crisis" || safety?.riskLevel === "tier_2") ? 1 : 2;

  const fallback = {
    // Prefer emotion's recommended mode (fixes bug where proud/angry/etc fell back to warm_clear ignoring emotion rules)
    mode: emotionDefaultModes[emotion] || (intent === "direct_answer" || intent === "debugging" ? "direct_engineer" : "warm_clear"),
    template: fallbackTemplate[intent] || "companion_conversation_response",
    empathyLead: intensity !== "low",
    validateFirst: ["venting", "emotional_support", "expressing_confusion", "debugging", "sad", "angry", "anxious"].includes(intent) || ["sad", "angry", "anxious"].includes(emotion),
    useAnalogy: emotion === "confused",
    explanationDepth: intensity === "high" ? "focused" : "balanced",
    questionLimit: dynamicQuestionLimit,
    reviewMode: "standard"
  };

  const chosen = strategies[`${emotion}:${intent}`] || fallback;

  // Always enrich emotional / support cases with raw human support pattern data
  // so the planner and tone layer make HAZY think/generate like a real companion
  // instead of filtered AI.
  if (["calm_supporter", "low_energy_soft", "excited_collaborator"].includes(chosen.mode) ||
      ["sad", "angry", "anxious", "overwhelmed", "grieving", "lonely"].includes(emotion) ||
      intensity === "high" || intensity === "crisis" ||
      safety?.riskLevel === "tier_2") {
    chosen.supportGuide = getHumanSupportGuide(emotion, safety, intensity);
  }

  return chosen;
}

module.exports = { selectEmpathyStrategy };
