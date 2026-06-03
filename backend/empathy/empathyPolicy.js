function selectEmpathyStrategy({ emotion, intent, intensity, safety }) {
  if (safety?.riskLevel === "tier_3") {
    return {
      mode: "calm_supporter",
      template: "crisis_support_response",
      empathyLead: true,
      validateFirst: true,
      useAnalogy: false,
      explanationDepth: "brief",
      questionLimit: 1,
      reviewMode: "strict"
    };
  }

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

  const fallback = {
    mode: intent === "direct_answer" || intent === "debugging" ? "direct_engineer" : "warm_clear",
    template: intent === "planning" ? "planning_response" : "technical_response",
    empathyLead: intensity !== "low",
    validateFirst: ["venting", "emotional_support", "expressing_confusion", "debugging"].includes(intent),
    useAnalogy: emotion === "confused",
    explanationDepth: intensity === "high" ? "focused" : "balanced",
    questionLimit: 1,
    reviewMode: "standard"
  };

  return strategies[`${emotion}:${intent}`] || fallback;
}

module.exports = { selectEmpathyStrategy };
