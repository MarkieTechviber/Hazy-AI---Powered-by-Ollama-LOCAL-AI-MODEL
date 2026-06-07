'use strict';

function extractResponseText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload.message?.content
    || payload.response
    || payload.choices?.[0]?.message?.content
    || ''
  );
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
