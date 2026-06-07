const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MemoryManager } = require("../memory/memoryManager");

function createManager() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hazy-memory-"));
  return {
    directory,
    manager: new MemoryManager(directory)
  };
}

test("conversation turns and typed memories persist in SQLite", () => {
  const { directory, manager } = createManager();
  manager.recordTurn({
    conversationId: "chat-1",
    userId: "user-1",
    userMessage: "My name is Mark. I am working on Hazy AI.",
    finalResponse: "Good to know, Mark.",
    analysis: { mode: "companion" }
  });

  const conversation = manager.getConversation("chat-1");
  assert.equal(conversation.turns.length, 2);
  assert.equal(conversation.turns[0].content, "My name is Mark. I am working on Hazy AI.");

  const memories = manager.listMemories({ userId: "user-1" });
  assert.ok(memories.some((memory) => memory.key === "name" && memory.value === "Mark"));
  assert.ok(memories.some((memory) => memory.type === "project_fact"));

  const reopened = new MemoryManager(directory);
  assert.equal(reopened.getConversation("chat-1").turns.length, 2);
});

test("memory can be disabled, re-enabled, and deleted", () => {
  const { manager } = createManager();
  const memory = manager.upsertMemory({
    userId: "user-1",
    type: "preference",
    key: "answer_style",
    value: "concise"
  });

  assert.equal(manager.setMemoryStatus(memory.id, "user-1", "disabled"), true);
  assert.equal(manager.listMemories({ userId: "user-1" }).length, 0);
  assert.equal(
    manager.listMemories({ userId: "user-1", status: "disabled" })[0].value,
    "concise"
  );

  assert.equal(manager.setMemoryStatus(memory.id, "user-1", "active"), true);
  assert.equal(manager.deleteMemory(memory.id, "user-1"), true);
  assert.equal(manager.listMemories({ userId: "user-1", status: "all" }).length, 0);
});

test("secret-like messages are not extracted as companion memories", () => {
  const { manager } = createManager();
  manager.recordTurn({
    conversationId: "chat-2",
    userId: "user-1",
    userMessage: "Remember that my API key is sk-not-a-real-key",
    finalResponse: "I will not store credentials in companion memory.",
    analysis: {}
  });

  assert.equal(manager.listMemories({ userId: "user-1" }).length, 0);
});

test("full conversation UI state persists and removed chats are deleted", () => {
  const { manager } = createManager();
  manager.saveConversationStates({
    "chat-1": {
      title: "Hazy roadmap",
      createdAt: 1000,
      messages: [{ role: "user", content: "Build the roadmap" }]
    },
    "chat-2": {
      title: "Second chat",
      createdAt: 2000,
      messages: []
    }
  }, "user-1");

  const initial = manager.listConversationStates("user-1");
  assert.equal(initial["chat-1"].title, "Hazy roadmap");
  assert.equal(initial["chat-1"].messages[0].content, "Build the roadmap");

  manager.saveConversationStates({
    "chat-1": {
      ...initial["chat-1"],
      title: "Updated roadmap"
    }
  }, "user-1");

  const updated = manager.listConversationStates("user-1");
  assert.equal(updated["chat-1"].title, "Updated roadmap");
  assert.equal(updated["chat-2"], undefined);
  assert.equal(manager.deleteConversationState("chat-1", "user-1"), true);
  assert.deepEqual(manager.listConversationStates("user-1"), {});
});
