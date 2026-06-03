function classifyMessage(message = "", intentData = null) {
  const text = String(message).trim();

  if (!text) {
    return { messageType: "empty", needsTooling: false, likelyNeedsRetrieval: false };
  }

  const intent = intentData?.primaryIntent;
  let messageType = "general_chat";

  if (intent === "debugging") {
    messageType = "debugging";
  } else if (intent === "planning") {
    messageType = "planning";
  } else if (intent === "creative_help") {
    messageType = "creative";
  } else if (intent === "celebration") {
    messageType = "celebration";
  } else if (intent === "venting" || intent === "emotional_support") {
    messageType = "support";
  } else if (intent === "technical_question" || intent === "expressing_confusion") {
    messageType = "technical";
  }

  return {
    messageType,
    needsTooling: /\b(search|look up|find|run|execute|build|generate)\b/i.test(text),
    likelyNeedsRetrieval: /\b(codebase|document|file|project|remember|earlier|previous)\b/i.test(text)
  };
}

module.exports = { classifyMessage };
