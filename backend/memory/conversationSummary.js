function summarizeConversation(messages = []) {
  const recent = messages.slice(-8);
  const userGoals = recent.filter((message) => message.role === "user").slice(-3).map((message) => message.content);
  const hazyMoves = recent.filter((message) => message.role === "assistant").slice(-2).map((message) => message.content);

  return {
    summary: [
      userGoals.length ? `Recent user goals: ${userGoals.join(" | ")}` : null,
      hazyMoves.length ? `Recent Hazy help: ${hazyMoves.join(" | ")}` : null
    ].filter(Boolean).join("\n")
  };
}

module.exports = { summarizeConversation };
