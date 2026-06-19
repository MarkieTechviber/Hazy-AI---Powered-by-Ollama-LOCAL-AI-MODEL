const { detectEmotion } = require("./emotionDetector");
const { detectIntent } = require("./intentDetector");
const { detectSafety } = require("./safetyDetector");
const { detectIntensity } = require("./intensityDetector");
const { selectEmpathyStrategy } = require("./empathyPolicy");
const { getToneProfile } = require("./toneProfiles");
const { planResponse } = require("./responsePlanner");

function testMessage(msg) {
  const emotion = detectEmotion(msg);
  const intent = detectIntent(msg);
  const safety = detectSafety(msg);
  const intensityData = require("./intensityDetector").detectIntensity(msg);
  const strategy = selectEmpathyStrategy({
    emotion: emotion.emotion,
    intent: intent.primaryIntent,
    intensity: intensityData.intensity,
    safety
  });
  const tone = getToneProfile(strategy.mode);

  // Also run planner to show the human support directive in action
  const plan = planResponse({
    strategy,
    userNeed: emotion.userNeed,
    toneProfile: tone,
    memory: [],
    ragContext: []
  });

  const hasHumanSupport = !!plan.humanSupportDirective;
  const supportVibe = hasHumanSupport ? plan.humanSupportDirective.situation.vibe : null;

  return {
    msg: msg.substring(0, 55) + (msg.length > 55 ? "..." : ""),
    emotion: emotion.emotion,
    intent: intent.primaryIntent,
    intensity: intensityData.intensity,
    safety: safety.riskLevel,
    strategyMode: strategy.mode,
    template: strategy.template,
    supportVibe,
    questionLimit: strategy.questionLimit,
    hasHumanSupportDirective: hasHumanSupport
  };
}

console.log("=== HAZY AI Logic Test (after fix) ===");
console.log(testMessage("I'm so proud I finally shipped the feature!!!"));
console.log(testMessage("This is garbage, I hate this bullshit, it's ridiculous"));
console.log(testMessage("I'm feeling really down and invisible again"));
console.log(testMessage("How does this work? Can you explain the difference?"));
console.log(testMessage("I don't get it, I'm lost and confused about the API"));
console.log(testMessage("Just tell me the short answer, no fluff"));
