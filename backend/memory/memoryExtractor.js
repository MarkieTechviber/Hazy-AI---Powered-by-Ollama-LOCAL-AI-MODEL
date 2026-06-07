const SECRET_PATTERN = /\b(password|passcode|secret|api[_ -]?key|private[_ -]?key|access[_ -]?token|credit card|cvv|seed phrase)\b/i;

function cleanValue(value) {
  return String(value || "")
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function makeKey(value) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "fact";
}

function extractMemoryCandidates(message = "") {
  const text = String(message || "").trim();
  if (!text || SECRET_PATTERN.test(text)) return [];

  const candidates = [];
  const add = (type, key, value, confidence, sensitivity = "normal") => {
    const cleaned = cleanValue(value);
    if (!cleaned || cleaned.length < 2) return;
    candidates.push({ type, key: makeKey(key || cleaned), value: cleaned, confidence, sensitivity });
  };

  let match = text.match(/\b(?:please\s+)?remember(?:\s+that)?\s+(.{2,500})/i);
  if (match) add("explicit_fact", match[1], match[1], 0.98);

  match = text.match(/\bmy name is\s+([a-z][a-z '-]{1,80})/i);
  if (match) add("personal_fact", "name", match[1], 0.97, "personal");

  match = text.match(/\b(?:please\s+)?call me\s+([a-z][a-z '-]{1,80})/i);
  if (match) add("preference", "preferred_name", match[1], 0.97, "personal");

  match = text.match(/\bi (?:really )?(?:prefer|like)\s+(.{2,300})/i);
  if (match) add("preference", match[1], match[1], 0.84);

  match = text.match(/\bi (?:do not|don't|really don't|dislike|hate)\s+(.{2,300})/i);
  if (match) add("boundary", match[1], match[1], 0.9, "personal");

  match = text.match(/\bi(?:'m| am) (?:currently )?(?:working on|building|creating)\s+(.{2,300})/i);
  if (match) add("project_fact", match[1], match[1], 0.82);

  const unique = new Map();
  for (const candidate of candidates) {
    unique.set(`${candidate.type}:${candidate.key}`, candidate);
  }
  return [...unique.values()];
}

module.exports = { extractMemoryCandidates, SECRET_PATTERN };
