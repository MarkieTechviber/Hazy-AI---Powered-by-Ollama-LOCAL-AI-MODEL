'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');

function requestJson(target, {
  method = 'POST', headers = {}, body, timeoutMs = 60_000, signal, maxResponseBytes = 8 * 1024 * 1024
} = {}) {
  return new Promise((resolve, reject) => {
    const parsed = target instanceof URL ? target : new URL(target);
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (response) => {
      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxResponseBytes) {
          request.destroy(Object.assign(new Error('Provider response exceeded the size limit.'), { code: 'PROVIDER_RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = JSON.parse(raw || '{}');
        } catch {
          data = { error: { message: raw || 'Provider returned invalid JSON.' } };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = data?.error?.message || data?.message || `Provider request failed (${response.statusCode}).`;
          const error = new Error(message);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Provider request timed out.')));
    request.on('error', reject);
    if (signal) {
      if (signal.aborted) {
        request.destroy(Object.assign(new Error('Provider request aborted.'), { code: 'ABORT_ERR' }));
        return;
      }
      signal.addEventListener('abort', () => {
        request.destroy(Object.assign(new Error('Provider request aborted.'), { code: 'ABORT_ERR' }));
      }, { once: true });
    }
    request.write(JSON.stringify(body || {}));
    request.end();
  });
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function toOpenAITools(tools = []) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: tool.strict === true
    }
  }));
}

function toOpenAIMessages(input = []) {
  return input.map((message) => {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments || {})
          }
        }))
      };
    }
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.callId,
        content: String(message.content || '')
      };
    }
    return { role: message.role, content: String(message.content || '') };
  });
}

function normalizeOpenAIResponse(data) {
  const message = data?.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => ({
    id: call.id || crypto.randomUUID(),
    name: call.function?.name || '',
    arguments: parseArguments(call.function?.arguments)
  })).filter((call) => call.name);
  const usage = {
    inputTokens: Number(data?.usage?.prompt_tokens || 0),
    outputTokens: Number(data?.usage?.completion_tokens || 0)
  };
  if (toolCalls.length) {
    return { type: 'tool_calls', text: message.content || '', toolCalls, usage };
  }
  return { type: 'final_answer', text: message.content || '', usage };
}

function toOllamaMessages(input = []) {
  return input.map((message) => {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.toolCalls.map((call) => ({
          function: { name: call.name, arguments: call.arguments || {} }
        }))
      };
    }
    if (message.role === 'tool') {
      return { role: 'tool', content: String(message.content || '') };
    }
    return { role: message.role, content: String(message.content || '') };
  });
}

function normalizeOllamaResponse(data) {
  const message = data?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => ({
    id: call.id || crypto.randomUUID(),
    name: call.function?.name || '',
    arguments: parseArguments(call.function?.arguments)
  })).filter((call) => call.name);
  const usage = {
    inputTokens: Number(data?.prompt_eval_count || 0),
    outputTokens: Number(data?.eval_count || 0)
  };
  if (toolCalls.length) {
    return { type: 'tool_calls', text: message.content || '', toolCalls, usage };
  }
  return { type: 'final_answer', text: message.content || '', usage };
}

function toAnthropicMessages(input = []) {
  const messages = [];
  for (const message of input.filter((item) => item.role !== 'system')) {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      messages.push({
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.arguments || {}
          }))
        ]
      });
      continue;
    }
    if (message.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: message.callId,
        content: String(message.content || '')
      };
      const previous = messages.at(-1);
      if (previous?.role === 'user' && Array.isArray(previous.content)
        && previous.content.every((item) => item.type === 'tool_result')) {
        previous.content.push(block);
      } else {
        messages.push({ role: 'user', content: [block] });
      }
      continue;
    }
    messages.push({ role: message.role, content: String(message.content || '') });
  }
  return messages;
}

function normalizeAnthropicResponse(data) {
  const toolCalls = (data?.content || []).filter((item) => item.type === 'tool_use').map((call) => ({
    id: call.id || crypto.randomUUID(),
    name: call.name || '',
    arguments: call.input || {}
  })).filter((call) => call.name);
  const text = (data?.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('');
  const usage = {
    inputTokens: Number(data?.usage?.input_tokens || 0),
    outputTokens: Number(data?.usage?.output_tokens || 0)
  };
  if (toolCalls.length) return { type: 'tool_calls', text, toolCalls, usage };
  return { type: 'final_answer', text, usage };
}

function toGeminiContents(input = []) {
  // map internal {role, content, toolCalls, callId} to Gemini contents + systemInstruction.
  // assistant toolCalls -> model + functionCall parts; tool results -> user + functionResponse (name via idToName scan for roundtrips); system separate.
  const idToName = {};
  for (const msg of input) {
    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls)) {
      for (const call of msg.toolCalls) {
        if (call.id && call.name) idToName[call.id] = call.name;
      }
    }
  }
  const contents = [];
  for (const message of input.filter((item) => item.role !== 'system')) {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      contents.push({
        role: 'model',
        parts: [
          ...(message.content ? [{ text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            functionCall: {
              name: call.name,
              args: call.arguments || {}
            }
          }))
        ]
      });
      continue;
    }
    if (message.role === 'tool') {
      const name = idToName[message.callId] || 'unknown_tool';
      let responseObj;
      try {
        responseObj = JSON.parse(String(message.content || '{}'));
      } catch {
        responseObj = { result: String(message.content || '') };
      }
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name,
            response: responseObj
          }
        }]
      });
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }]
    });
  }
  return contents;
}

function toGeminiTools(tools = []) {
  if (!tools || !tools.length) return undefined;
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} }
    }))
  }];
}

function normalizeGeminiResponse(data) {
  if (data && data.error) {
    const message = data.error.message || 'Gemini error';
    const err = new Error(message);
    err.providerBody = data;
    throw err;
  }
  const candidate = (data && data.candidates && data.candidates[0]) || {};
  const parts = (candidate.content && candidate.content.parts) || [];
  const toolCalls = parts
    .filter((p) => p && p.functionCall)
    .map((p) => ({
      id: crypto.randomUUID(),
      name: p.functionCall.name || '',
      arguments: p.functionCall.args || {}
    }))
    .filter((call) => call.name);
  const text = parts
    .filter((p) => p && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  const usage = {
    inputTokens: Number((data && data.usageMetadata && data.usageMetadata.promptTokenCount) || 0),
    outputTokens: Number((data && data.usageMetadata && data.usageMetadata.candidatesTokenCount) || 0)
  };
  if (toolCalls.length) return { type: 'tool_calls', text, toolCalls, usage };
  return { type: 'final_answer', text, usage };
}

function createProviderAgentCaller({ providerBody, cfg, getApiKey }) {
  const modelId = providerBody.model || cfg.defaults?.textModel || 'ollama/llama3.2';
  const provider = modelId.split('/')[0];

  return async ({ input, tools, temperature, signal, timeoutMs }) => {
    if (provider === 'ollama') {
      const baseUrl = new URL(cfg.providers?.ollama?.baseUrl || 'http://localhost:11434');
      const reasoningMode = providerBody.hazyReasoning?.reasoningMode;
      const useThink = reasoningMode !== 'off';

      // FIX #2 (Ollama) — map budgetTokens to num_ctx hint so thinking
      // models (e.g. qwen3, deepseek-r1) get an appropriate context size.
      // Ollama doesn't have a native budget param so this is the closest
      // lever we have. Only apply for models that support thinking.
      const budgetTokens = providerBody.hazyReasoning?.budgetTokens || 0;
      const inferredNumCtx = useThink && budgetTokens > 0
        ? Math.min(32768, 4096 + budgetTokens * 2)
        : undefined;
      const configuredNumCtx = Number(providerBody.options?.num_ctx);
      const numCtx = Number.isFinite(configuredNumCtx) && configuredNumCtx > 0
        ? Math.floor(configuredNumCtx)
        : inferredNumCtx;

      const data = await requestJson(new URL('/api/chat', baseUrl), {
        signal,
        timeoutMs,
        body: {
          model: modelId.replace(/^ollama\//, ''),
          messages: toOllamaMessages(input),
          tools: toOpenAITools(tools),
          stream: false,
          think: useThink,
          options: {
            ...(providerBody.options || {}),
            temperature,
            ...(numCtx ? { num_ctx: numCtx } : {})
          }
        }
      });
      return normalizeOllamaResponse(data);
    }

    if (provider === 'anthropic') {
      const apiKey = getApiKey('anthropic', cfg);
      if (!apiKey) throw new Error('Anthropic API key is not configured.');

      const reasoningMode = providerBody.hazyReasoning?.reasoningMode;
      const budgetTokens = providerBody.hazyReasoning?.budgetTokens || 0;

      // FIX #2 (Anthropic) — Extended thinking requires:
      //   1. thinking: { type: 'enabled', budget_tokens: N } in the body
      //   2. temperature MUST be exactly 1 (API enforces this)
      //   3. budget_tokens must be at least 1024
      // Without these, the API returns a 400 or silently ignores the flag.
      const useExtendedThinking = reasoningMode === 'deep' || budgetTokens >= 1024;
      const thinkingParam = useExtendedThinking
        ? { thinking: { type: 'enabled', budget_tokens: Math.max(1024, budgetTokens) } }
        : {};
      const effectiveTemperature = useExtendedThinking ? 1 : temperature;

      const data = await requestJson('https://api.anthropic.com/v1/messages', {
        signal,
        timeoutMs,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: {
          model: modelId.replace(/^anthropic\//, ''),
          system: input.find((message) => message.role === 'system')?.content || '',
          messages: toAnthropicMessages(input),
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
          })),
          tool_choice: { type: 'auto' },
          max_tokens: providerBody.options?.max_tokens || 4096,
          temperature: effectiveTemperature,
          ...thinkingParam
        }
      });
      return normalizeAnthropicResponse(data);
    }

    if (provider === 'gemini') {
      const apiKey = getApiKey('gemini', cfg);
      if (!apiKey) throw new Error('Gemini API key is not configured.');

      const gemModel = modelId.replace(/^gemini\//, '');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent`;
      const sys = input.find((message) => message.role === 'system');
      const body = {
        contents: toGeminiContents(input),
        generationConfig: {
          temperature,
          maxOutputTokens: providerBody.options?.max_tokens || 4096
        }
      };
      if (sys && sys.content) {
        body.systemInstruction = { parts: [{ text: sys.content }] };
      }
      if (tools && tools.length) {
        body.tools = toGeminiTools(tools);
        body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
      }
      const data = await requestJson(url, { headers: { 'x-goog-api-key': apiKey }, body, signal, timeoutMs });
      return normalizeGeminiResponse(data);
    }

    const compatible = {
      openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        keyName: 'openai',
        // FIX #3 — remove double replace (was: .replace(/^openai\//, ''))
        model: modelId.replace(/^openai\//, '')
      },
      groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyName: 'groq',
        model: modelId.replace(/^groq\//, '')
      },
      nvidia: {
        url: `${(cfg.providers?.nvidia?.baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')}/chat/completions`,
        keyName: 'nvidia',
        // FIX #3 — nvidia had .replace(/^nvidia\//, '').replace(/^nvidia\//, '')
        // The second replace was redundant. Cleaned up.
        model: modelId.replace(/^nvidia\//, '')
      }
    }[provider];

    if (!compatible) {
      throw new Error(`Agent tool calling is not yet supported for provider: ${provider}`);
    }
    const apiKey = getApiKey(compatible.keyName, cfg);
    if (!apiKey) throw new Error(`${provider} API key is not configured.`);
    let max_tokens = providerBody.options?.max_tokens || 4096;
    if (provider === 'groq' && (compatible.model.includes('llama-3.1-8b') || compatible.model.includes('llama-3.3-70b') || compatible.model.includes('qwen3-32b'))) {
      const msgs = toOpenAIMessages(input);
      let charCount = 0;
      for (const m of msgs) {
        charCount += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length;
      }
      const estimatedPromptTokens = Math.ceil(charCount / 4);
      if (estimatedPromptTokens + max_tokens > 5800) {
        max_tokens = Math.max(512, 5800 - estimatedPromptTokens);
      }
    }

    const data = await requestJson(compatible.url, {
      signal,
      timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model: compatible.model,
        messages: toOpenAIMessages(input),
        tools: toOpenAITools(tools),
        tool_choice: 'auto',
        stream: false,
        max_tokens,
        temperature
      }
    });
    return normalizeOpenAIResponse(data);
  };
}

module.exports = {
  createProviderAgentCaller,
  normalizeAnthropicResponse,
  normalizeGeminiResponse,
  normalizeOllamaResponse,
  normalizeOpenAIResponse,
  toAnthropicMessages,
  toGeminiContents,
  toGeminiTools,
  toOllamaMessages,
  toOpenAIMessages,
  toOpenAITools
};
