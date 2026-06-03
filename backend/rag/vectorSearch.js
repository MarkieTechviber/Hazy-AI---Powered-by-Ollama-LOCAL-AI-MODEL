const fs = require("fs");
const path = require("path");
const { buildTokenSet, tokenize } = require("./embeddingService");

class VectorSearch {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, "rag-index.json");
  }

  ensureFile() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
    }
  }

  readIndex() {
    this.ensureFile();
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  writeIndex(entries) {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2));
  }

  addDocuments(chunks = []) {
    const current = this.readIndex();
    const enriched = chunks.map((chunk) => ({
      ...chunk,
      tokenSet: Array.from(buildTokenSet(chunk.text))
    }));
    this.writeIndex([...current, ...enriched]);
  }

  search(query = "", limit = 4) {
    const entries = this.readIndex();
    const queryTokens = tokenize(query);

    const ranked = entries
      .map((entry) => {
        const tokenSet = new Set(entry.tokenSet || []);
        const score = queryTokens.reduce((sum, token) => sum + (tokenSet.has(token) ? 1 : 0), 0);
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        source: entry.source,
        text: entry.text.slice(0, 400),
        summary: `[${path.basename(entry.source)}] ${entry.text.slice(0, 220).replace(/\s+/g, " ")}`
      }));

    return ranked;
  }
}

module.exports = { VectorSearch };
