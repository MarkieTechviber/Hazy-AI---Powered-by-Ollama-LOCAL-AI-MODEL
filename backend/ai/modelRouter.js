function normalizeMessages(messages = []) {
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role || "user",
      content: message.content
    }));
}

function mergeSystemPrompt(messages, supportPrompt) {
  const normalized = normalizeMessages(messages);
  const systemParts = normalized
    .filter((message) => message.role === "system")
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
    ...conversation
  ];
}

function prepareProviderPayload(body, supportPrompt) {
  return {
    ...body,
    messages: mergeSystemPrompt(body.messages || [], supportPrompt)
  };
}

module.exports = {
  normalizeMessages,
  mergeSystemPrompt,
  prepareProviderPayload
};
