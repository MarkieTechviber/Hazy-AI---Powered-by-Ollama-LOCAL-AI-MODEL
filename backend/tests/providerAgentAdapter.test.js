const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAnthropicResponse,
  normalizeOllamaResponse,
  normalizeOpenAIResponse,
  toAnthropicMessages,
  toOpenAIMessages,
  toOpenAITools
} = require("../ai/providerAgentAdapter");

test("OpenAI adapter preserves assistant tool calls and tool results", () => {
  const messages = toOpenAIMessages([
    { role: "user", content: "Calculate 2 + 2" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{
        id: "call-1",
        name: "calculator.evaluate",
        arguments: { expression: "2 + 2" }
      }]
    },
    { role: "tool", callId: "call-1", content: "{\"value\":4}" }
  ]);

  assert.equal(messages[1].tool_calls[0].function.name, "calculator.evaluate");
  assert.equal(messages[2].tool_call_id, "call-1");
  assert.deepEqual(JSON.parse(messages[1].tool_calls[0].function.arguments), {
    expression: "2 + 2"
  });
});

test("provider responses normalize tool calls and usage", () => {
  const openai = normalizeOpenAIResponse({
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: "call-1",
          function: {
            name: "web.search",
            arguments: "{\"query\":\"current weather\"}"
          }
        }]
      }
    }],
    usage: { prompt_tokens: 10, completion_tokens: 4 }
  });
  assert.equal(openai.type, "tool_calls");
  assert.deepEqual(openai.toolCalls[0].arguments, { query: "current weather" });
  assert.deepEqual(openai.usage, { inputTokens: 10, outputTokens: 4 });

  const ollama = normalizeOllamaResponse({
    message: { content: "Four.", tool_calls: [] },
    prompt_eval_count: 8,
    eval_count: 2
  });
  assert.equal(ollama.type, "final_answer");
  assert.equal(ollama.text, "Four.");

  const anthropic = normalizeAnthropicResponse({
    content: [{
      type: "tool_use",
      id: "tool-1",
      name: "calculator.evaluate",
      input: { expression: "2+2" }
    }],
    usage: { input_tokens: 12, output_tokens: 3 }
  });
  assert.equal(anthropic.type, "tool_calls");
  assert.equal(anthropic.toolCalls[0].name, "calculator.evaluate");
});

test("tool schemas and Anthropic tool result blocks use provider contracts", () => {
  const tools = toOpenAITools([{
    name: "web.search",
    description: "Search",
    parameters: { type: "object", properties: {} },
    strict: true
  }]);
  assert.equal(tools[0].function.name, "web.search");
  assert.equal(tools[0].function.strict, true);

  const messages = toAnthropicMessages([
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "a1", name: "web.search", arguments: { query: "Hazy" } }]
    },
    { role: "tool", callId: "a1", content: "result" }
  ]);
  assert.equal(messages[0].content[0].type, "tool_use");
  assert.equal(messages[1].content[0].type, "tool_result");
  assert.equal(messages[1].content[0].tool_use_id, "a1");
});
