function chunkText(text = "", { maxLength = 800, overlap = 120 } = {}) {
  const input = String(text);
  if (!input) return [];

  const chunks = [];
  let cursor = 0;

  while (cursor < input.length) {
    const end = Math.min(cursor + maxLength, input.length);
    const slice = input.slice(cursor, end);
    chunks.push(slice);
    cursor = end - overlap;
    if (cursor < 0) cursor = 0;
    if (end === input.length) break;
  }

  return chunks;
}

module.exports = { chunkText };
