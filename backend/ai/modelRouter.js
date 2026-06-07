const { applyContextWindow } = require('./context/contextWindowManager');

function normalizeMessages(messages = []) {
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      ...message,
      role: message.role || "user",
      content: message.content
    }));
}

function mergeSystemPrompt(messages, supportPrompt) {
  const normalized = normalizeMessages(messages);
  const contextualSystem = normalized.filter((message) =>
    message.role === "system"
    && (
      message.contextSlot
      || /^TOOL CONTEXT\b/i.test(message.content)
      || /^\[(?:Tool:|Retrieved Context|Doc|Conversation Summary)/i.test(message.content)
    )
  );
  const systemParts = normalized
    .filter((message) => message.role === "system" && !contextualSystem.includes(message))
    .map((message) => message.content.trim())
    .filter(Boolean);
  const conversation = normalized.filter((message) => message.role !== "system");
  const support = typeof supportPrompt === "string" ? supportPrompt.trim() : "";

  if (support) {
    systemParts.push([
      "Additional operational guidance for this reply:",
      support
    ].join("\n"));
  }

  if (!systemParts.length) {
    return conversation;
  }

  return [
    { role: "system", content: systemParts.join("\n\n") },
    ...contextualSystem,
    ...conversation
  ];
}

function prepareProviderPayload(body, supportPrompt) {
  const payload = {
    ...body,
    messages: mergeSystemPrompt(body.messages || [], supportPrompt)
  };
  return applyContextWindow(payload);
}

module.exports = {
  normalizeMessages,
  mergeSystemPrompt,
  prepareProviderPayload
};
