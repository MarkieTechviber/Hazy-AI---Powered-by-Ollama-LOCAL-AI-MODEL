function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter(Boolean);
}

function buildTokenSet(text = "") {
  return new Set(tokenize(text));
}

module.exports = { tokenize, buildTokenSet };
