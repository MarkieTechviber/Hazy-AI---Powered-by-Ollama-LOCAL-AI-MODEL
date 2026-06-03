const path = require("path");
const { detectEmotion } = require("./empathy/emotionDetector");
const { detectIntent } = require("./empathy/intentDetector");
const { classifyMessage } = require("./empathy/messageClassifier");
const { detectSafety } = require("./empathy/safetyDetector");
const { selectEmpathyStrategy } = require("./empathy/empathyPolicy");
const { planResponse } = require("./empathy/responsePlanner");
const { getToneProfile } = require("./empathy/toneProfiles");
const { buildSystemPrompt } = require("./ai/promptBuilder");
const { prepareProviderPayload } = require("./ai/modelRouter");
const { reviewResponse } = require("./ai/responseReviewer");
const { analyzeCodeRequest } = require("./ai/coding/codeIntelligence");
const { scanProjectContext } = require("./ai/coding/projectContextScanner");
const { buildReasoningProfile } = require("./ai/reasoning/reasoningController");
const { MemoryManager } = require("./memory/memoryManager");
const { VectorSearch } = require("./rag/vectorSearch");

const dataDir = path.join(__dirname, "..", "cache", "hazy-engine");
const memoryManager = new MemoryManager(path.join(dataDir, "memory"));
const vectorSearch = new VectorSearch(path.join(dataDir, "rag"));

function getLatestUserMessage(messages = []) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message?.role === "user")?.content || "";
}

function deriveProfileHints({ intentData, strategy }) {
  const hints = {};
  if (intentData.directnessPreference === "high") {
    hints.response_style = "direct";
  }
  if (strategy.mode) {
    hints.preferred_recent_tone = strategy.mode;
  }
  return hints;
}

function analyzeMessage({ body, conversationId = "default", userId = "default" }) {
  const latestMessage = getLatestUserMessage(body.messages || []);
  const emotionData = detectEmotion(latestMessage);
  const intentData = detectIntent(latestMessage);
  const messageType = classifyMessage(latestMessage, intentData);
  const safety = detectSafety(latestMessage);
  const strategy = selectEmpathyStrategy({
    emotion: emotionData.emotion,
    intent: intentData.primaryIntent,
    intensity: emotionData.intensity,
    safety
  });
  const toneProfile = getToneProfile(strategy.mode);
  const memory = memoryManager.getRelevantMemory({ conversationId, userId });
  const ragContext = vectorSearch.search(latestMessage);
  const toolResults = Array.isArray(body.hazy?.toolResults) ? body.hazy.toolResults : [];
  const userLangHint = body.hazy?.codeLangHint && body.hazy.codeLangHint !== "auto"
    ? body.hazy.codeLangHint
    : null;
  const projectContext = scanProjectContext({
    attachments: body.hazy?.attachments || [],
    messages: body.messages || []
  });
  const codeAnalysis = analyzeCodeRequest(
    latestMessage,
    body.messages || [],
    userLangHint,
    projectContext
  );
  const reasoning = buildReasoningProfile({
    message: latestMessage,
    mode: body.hazy?.mode || "chat",
    codeAnalysis,
    projectContext,
    safety
  });
  const responsePlan = planResponse({
    strategy,
    userNeed: emotionData.userNeed,
    toneProfile,
    memory,
    ragContext
  });

  const prompt = buildSystemPrompt({
    messageType: messageType.messageType,
    emotion: emotionData.emotion,
    intensity: emotionData.intensity,
    intent: intentData.primaryIntent,
    userNeed: emotionData.userNeed,
    responseMode: strategy.mode,
    responsePlan,
    memory,
    ragContext,
    questionLimit: strategy.questionLimit,
    safety,
    reasoning,
    codeAnalysis,
    projectContext,
    toolResults
  });

  return {
    latestMessage,
    emotionData,
    intentData,
    messageType,
    safety,
    strategy,
    toneProfile,
    memory,
    ragContext,
    toolResults,
    projectContext,
    codeAnalysis,
    reasoning,
    responsePlan,
    prompt
  };
}

function prepareChatRequest(body = {}) {
  const conversationId = body.conversationId || "default";
  const userId = body.userId || "default";
  const analysis = analyzeMessage({ body, conversationId, userId });
  const providerBody = prepareProviderPayload(body, analysis.prompt);

  return {
    conversationId,
    userId,
    analysis,
    providerBody
  };
}

function finalizeResponse({ conversationId, userId, userMessage, responseText, analysis }) {
  const review = reviewResponse(responseText, {
    intent: analysis.intentData.primaryIntent,
    emotion: analysis.emotionData.emotion,
    intensity: analysis.emotionData.intensity,
    taskType: analysis.reasoning?.taskType || "general",
    codeType: analysis.codeAnalysis?.codeType,
    language: analysis.codeAnalysis?.language,
    userMessage
  });

  memoryManager.recordTurn({
    conversationId,
    userId,
    userMessage,
    finalResponse: review.response,
    analysis: {
      emotion: analysis.emotionData.emotion,
      intent: analysis.intentData.primaryIntent,
      mode: analysis.strategy.mode
    },
    profileHints: deriveProfileHints({ intentData: analysis.intentData, strategy: analysis.strategy })
  });

  return review;
}

module.exports = {
  analyzeMessage,
  prepareChatRequest,
  finalizeResponse
};
