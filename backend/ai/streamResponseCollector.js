'use strict';

// FIX #5 — Original extractResponseText handled Ollama and OpenAI formats
// but missed Anthropic's streaming delta structure entirely.
// Anthropic SSE sends content_block_delta events with this shape:
//   { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
// Without this branch, streaming from Anthropic produced empty responses.
function extractResponseText(payload) {
  if (!payload || typeof payload !== 'object') return '';

  // Anthropic streaming delta
  if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
    return String(payload.delta.text || '');
  }

  // Anthropic thinking block delta (skip — private reasoning, never surface)
  if (payload.type === 'content_block_delta' && payload.delta?.type === 'thinking_delta') {
    return '';
  }

  // Ollama streaming format
  if (payload.message?.content !== undefined) {
    return String(payload.message.content || '');
  }

  // Ollama single-response (non-streaming)
  if (payload.response !== undefined) {
    return String(payload.response || '');
  }

  // OpenAI / compatible streaming delta
  if (payload.choices?.[0]?.delta?.content !== undefined) {
    return String(payload.choices[0].delta.content || '');
  }

  // OpenAI non-streaming
  if (payload.choices?.[0]?.message?.content !== undefined) {
    return String(payload.choices[0].message.content || '');
  }

  return '';
}

function createStreamResponseCollector(onComplete = () => {}) {
  let buffer = '';
  let responseText = '';
  let finished = false;

  function parseLine(line) {
    const value = String(line || '').trim();
    if (!value || value === 'data: [DONE]' || value === '[DONE]') return;
    const jsonText = value.startsWith('data: ') ? value.slice(6).trim() : value;
    try {
      responseText += extractResponseText(JSON.parse(jsonText));
    } catch {
      // JSON can be split across transport chunks; the outer buffer handles it.
    }
  }

  function observe(chunk) {
    if (chunk == null || finished) return;
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(parseLine);
  }

  function finish() {
    if (finished) return responseText;
    finished = true;
    if (buffer.trim()) parseLine(buffer);
    buffer = '';
    if (responseText.trim()) onComplete(responseText);
    return responseText;
  }

  return {
    observe,
    finish,
    getResponseText: () => responseText
  };
}

module.exports = { createStreamResponseCollector, extractResponseText };
