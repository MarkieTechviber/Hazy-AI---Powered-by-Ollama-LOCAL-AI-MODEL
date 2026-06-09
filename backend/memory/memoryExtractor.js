'use strict';

// Labels alone are not always secrets. Example: "my app uses API key encryption"
// should be allowed as a project fact. Actual secret-looking values and labeled
// credential assignments are blocked by containsSecret().
const SECRET_LABEL_PATTERN = /\b(password|passcode|secret|api[_ -]?key|private[_ -]?key|access[_ -]?token|bearer\s+token|credit card|card number|cvv|seed phrase|recovery phrase|mnemonic)\b/i;
const SECRET_ASSIGNMENT_PATTERN = /\b(password|passcode|secret|api[_ -]?key|private[_ -]?key|access[_ -]?token|bearer\s+token|credit card|card number|cvv|seed phrase|recovery phrase|mnemonic)\b\s*(?:is|are|=|:|->|set to|as)\s*[^\s,;]{3,}/i;
const PRIVATE_KEY_PATTERN = /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/i;
const COMMON_TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|hf_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|ya29\.[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})\b/;
const BEARER_VALUE_PATTERN = /\bbearer\s+[A-Za-z0-9._~+\/=:-]{16,}\b/i;
const CARD_CONTEXT_PATTERN = /\b(?:credit card|card number|cvv)\b/i;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,19}\b/;

// Backward-compatible export name for older modules. New code should prefer
// containsSecret() because it distinguishes labels from actual values.
const SECRET_PATTERN = SECRET_LABEL_PATTERN;
const SENSITIVE_PATTERN = /\b(religion|political party|diagnosed|diagnosis|medical condition|mental health|sexuality|sex life|criminal record|union member|exact address|home address)\b/i;
const TEMPORARY_PATTERN = /\b(today|tonight|tomorrow|yesterday|this week|next week|right now|currently at|for now)\b/i;
const VAGUE_MEMORY_PATTERN = /^(this|that|it|this one|that one|these|those|this file|this code|this okay)$/i;

function cleanValue(value, limit = 500) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, limit)
    .trim();
}

function firstClause(value, limit = 500) {
  const cleaned = cleanValue(value, limit);
  const split = cleaned.split(/(?:\.\s+|!\s+|\?\s+|;\s+)/)[0];
  return cleanValue(split, limit);
}

function cleanName(value) {
  return cleanValue(value, 80)
    .split(/\b(?:and|but|because|from now on|for now)\b|[,;.!?]/i)[0]
    .trim();
}

function makeKey(value) {
  return cleanValue(value, 160)
    .toLowerCase()
    .replace(/\b(my|the|a|an|please|that|to|for)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "fact";
}

function containsSecret(value) {
  const text = String(value || "");
  if (!text) return false;
  if (PRIVATE_KEY_PATTERN.test(text)) return true;
  if (COMMON_TOKEN_PATTERN.test(text)) return true;
  if (BEARER_VALUE_PATTERN.test(text)) return true;
  if (SECRET_ASSIGNMENT_PATTERN.test(text)) return true;
  if (CARD_CONTEXT_PATTERN.test(text) && CARD_NUMBER_PATTERN.test(text)) return true;
  return false;
}

function redactSecrets(value) {
  return String(value || "")
    .replace(PRIVATE_KEY_PATTERN, "[redacted-private-key]")
    .replace(COMMON_TOKEN_PATTERN, "[redacted-secret]")
    .replace(BEARER_VALUE_PATTERN, "Bearer [redacted-secret]")
    .replace(/\b(password|passcode|secret|api[_ -]?key|private[_ -]?key|access[_ -]?token|bearer\s+token|credit card|card number|cvv|seed phrase|recovery phrase|mnemonic)\b\s*(?:is|are|=|:|->|set to|as)\s*[^\s,;]+/gi, "$1: [redacted-secret]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => CARD_CONTEXT_PATTERN.test(String(value || "")) ? "[redacted-card-number]" : match);
}

function shouldSkipMemory(value, { explicit = false } = {}) {
  const cleaned = cleanValue(value);
  if (!cleaned || cleaned.length < 2) return true;
  if (containsSecret(cleaned)) return true;
  if (VAGUE_MEMORY_PATTERN.test(cleaned.toLowerCase())) return true;
  // Auto extraction avoids sensitive categories. Explicit "remember that" is
  // allowed but marked personal by the caller when matched.
  if (!explicit && SENSITIVE_PATTERN.test(cleaned)) return true;
  return false;
}

function expiresAtFor(value) {
  if (!TEMPORARY_PATTERN.test(String(value || ""))) return null;
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function extractMemoryCandidates(message = "") {
  const text = String(message || "").trim();
  if (!text || containsSecret(text)) return [];

  const candidates = [];
  const add = (type, key, value, confidence, sensitivity = "normal", options = {}) => {
    const cleaned = firstClause(value);
    const explicit = options.explicit === true;
    if (shouldSkipMemory(cleaned, { explicit })) return;
    candidates.push({
      type,
      key: makeKey(key || cleaned),
      value: cleaned,
      confidence: Math.max(0, Math.min(Number(confidence) || 0, 1)),
      sensitivity: SENSITIVE_PATTERN.test(cleaned) ? "personal" : sensitivity,
      expiresAt: Object.prototype.hasOwnProperty.call(options, "expiresAt")
        ? options.expiresAt
        : expiresAtFor(cleaned)
    });
  };

  let match = text.match(/\b(?:please\s+)?remember(?:\s+that)?\s+(.{2,500})/i);
  if (match) {
    add(
      "explicit_fact",
      match[1],
      match[1],
      0.98,
      SENSITIVE_PATTERN.test(match[1]) ? "personal" : "normal",
      { explicit: true }
    );
  }

  match = text.match(/\bmy name is\s+([a-z][a-z '-]{1,80})/i);
  if (match) add("personal_fact", "name", cleanName(match[1]), 0.97, "personal");

  match = text.match(/\b(?:please\s+)?call me\s+([a-z][a-z '-]{1,80})/i);
  if (match) add("preference", "preferred_name", cleanName(match[1]), 0.97, "personal");

  match = text.match(/\bi (?:really )?(?:prefer|like)\s+(.{2,300})/i);
  if (match) add("preference", match[1], match[1], 0.84);

  match = text.match(/\bi (?:do not|don't|really don't|dislike|hate)\s+(.{2,300})/i);
  if (match) add("boundary", match[1], match[1], 0.9, "personal");

  match = text.match(/\bi(?:'m| am) (?:currently )?(?:working on|building|creating)\s+(.{2,300})/i);
  if (match) add("project_fact", match[1], match[1], 0.82, "normal", { expiresAt: null });

  const unique = new Map();
  for (const candidate of candidates) {
    unique.set(`${candidate.type}:${candidate.key}`, candidate);
  }
  return [...unique.values()];
}

function extractMemoryRemovals(message = "") {
  const text = String(message || "").trim();
  if (!text) return [];
  // Do not treat "don't forget" as a delete request.
  if (/\b(?:don't|do not)\s+forget\b/i.test(text)) return [];

  // Important: ordinary edit commands like "remove the button" or
  // "delete the file" must NOT delete memories. Only memory-intent phrases
  // should trigger memory removal.
  const patterns = [
    /\bforget\s+(?:that\s+)?(.{2,300})/i,
    /\b(?:stop\s+remembering|do not\s+remember|don't\s+remember)\s+(?:that\s+)?(.{2,300})/i,
    /\b(?:delete|remove)\s+(?:the\s+)?(?:memory|saved memory|remembered fact|stored fact)\s*(?:about|that says|for|of|:)?\s*(.{2,300})/i,
    /\b(?:delete|remove)\s+(.{2,300})\s+from\s+(?:memory|memories)\b/i
  ];

  const removals = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const target = firstClause(match[1], 300);
    if (!target) continue;
    removals.push({ target, key: makeKey(target) });
  }
  return removals;
}

module.exports = {
  extractMemoryCandidates,
  extractMemoryRemovals,
  cleanValue,
  makeKey,
  cleanName,
  containsSecret,
  redactSecrets,
  SECRET_PATTERN,
  SECRET_LABEL_PATTERN,
  SENSITIVE_PATTERN
};
