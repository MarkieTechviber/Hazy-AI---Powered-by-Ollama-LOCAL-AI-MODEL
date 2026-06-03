const fs = require("fs");
const path = require("path");
const { chunkText } = require("./chunker");

function ingestDocument(filePath) {
  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const chunks = chunkText(text).map((chunk, index) => ({
    id: `${path.basename(filePath)}:${index}`,
    text: chunk,
    source: absolutePath
  }));

  return {
    source: absolutePath,
    chunks
  };
}

module.exports = { ingestDocument };
