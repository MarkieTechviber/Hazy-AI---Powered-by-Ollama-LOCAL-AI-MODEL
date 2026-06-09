'use strict';

const vm = require('node:vm');

const FENCE_PATTERN = /```([a-z0-9_+#.-]*)\s*\n([\s\S]*?)```/gi;
const FILE_BLOCK_PATTERN = /===FILE:\s*([^\n=]+?)\s*===\s*([\s\S]*?)(?=\n===FILE:|\n===SETUP===|\n===|$)/gi;

function normalizeLanguage(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  const aliases = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby',
    sh: 'bash', shell: 'bash', ps1: 'powershell', cs: 'csharp',
    'c#': 'csharp', cpp: 'cpp', cxx: 'cpp', cc: 'cpp'
  };
  return aliases[raw] || raw;
}

function inferLanguageFromFilename(filename = '') {
  const ext = String(filename).split('.').pop()?.toLowerCase() || '';
  return normalizeLanguage(ext);
}

function extractCodeBlocks(response = '') {
  const text = String(response || '');
  const blocks = [];

  for (const match of text.matchAll(FILE_BLOCK_PATTERN)) {
    const filename = match[1].trim();
    blocks.push({
      kind: 'file',
      filename,
      language: inferLanguageFromFilename(filename),
      code: String(match[2] || '').trim()
    });
  }

  for (const match of text.matchAll(FENCE_PATTERN)) {
    blocks.push({
      kind: 'fence',
      filename: null,
      language: normalizeLanguage(match[1]),
      code: String(match[2] || '').trim()
    });
  }

  // IMPROVEMENT: preserve backwards compatibility with plain single-file code,
  // but prefer explicit file/fence blocks whenever they exist.
  if (!blocks.length && text.trim()) {
    blocks.push({ kind: 'plain', filename: null, language: '', code: text.trim() });
  }

  return blocks.filter((block) => block.code);
}

function stripCommentsAndStrings(code = '') {
  // FIX: delimiter checks used to count braces inside strings/comments, causing
  // false syntax warnings. This tiny lexer removes obvious JS/Python-like string
  // and comment regions before balance checking. It does NOT execute code.
  let output = '';
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    const next = code[i + 1];

    if (lineComment) {
      if (char === '\n') { lineComment = false; output += '\n'; }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === '#') { lineComment = true; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    output += char;
  }

  return output;
}

function hasBalancedDelimiters(code) {
  const cleaned = stripCommentsAndStrings(code);
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closing = new Set(Object.values(pairs));
  const stack = [];

  for (const char of cleaned) {
    if (pairs[char]) {
      stack.push(pairs[char]);
    } else if (closing.has(char) && stack.pop() !== char) {
      return false;
    }
  }

  return stack.length === 0;
}

function canVmParseAsScript(language, code) {
  const lang = normalizeLanguage(language);
  if (!['javascript', 'typescript'].includes(lang)) return false;
  // IMPROVEMENT: node:vm parses classic scripts, not TS syntax or ESM imports.
  // Skip those instead of reporting false negatives.
  if (/^\s*(import|export)\b/m.test(code)) return false;
  if (lang === 'typescript' && /:\s*[A-Za-z_$][\w$<>{}\[\]|&?,\s]*(?=[,)=;{])/m.test(code)) return false;
  return true;
}

function verifyJavaScriptSyntax(block) {
  if (!canVmParseAsScript(block.language, block.code)) return null;
  try {
    // IMPROVEMENT: compile only. vm.Script checks syntax without executing user
    // code; never call runInContext/runInThisContext here.
    new vm.Script(block.code, { filename: block.filename || 'hazy-response.js' });
    return null;
  } catch (error) {
    return { issue: 'likely_syntax_error', detail: error.message };
  }
}

function hasPythonSignals(code = '') {
  return /^\s*(def\s+\w+\s*\(|class\s+\w+\s*[:(]|from\s+[\w.]+\s+import\s+|import\s+[\w.]+\s*$|print\()/m.test(code);
}

function hasJavaScriptSignals(code = '') {
  return /\b(const|let|var|function)\b|=>|console\.|require\(|module\.exports|from\s+['"][^'"]+['"]|import\s+.*\s+from\s+['"]/m.test(code);
}

function detectLanguageMismatch(expectedLanguage, blocks) {
  const expected = normalizeLanguage(expectedLanguage);
  if (!expected || expected === 'auto') return false;

  for (const block of blocks) {
    const blockLang = normalizeLanguage(block.language);
    // FIX: fenced/file language tags are stronger than fragile token guesses.
    if (blockLang && blockLang !== expected) {
      if (expected === 'typescript' && blockLang === 'javascript') continue;
      if (expected === 'javascript' && blockLang === 'typescript') continue;
      return true;
    }

    if (expected === 'python' && hasJavaScriptSignals(block.code)) return true;
    // FIX: JS/TS imports like `import React from "react"` are valid JS and
    // should not be mistaken for Python imports.
    if (['javascript', 'typescript'].includes(expected) && hasPythonSignals(block.code)) return true;
  }
  return false;
}

function verifyCodeResponse(responseText, context = {}) {
  const response = String(responseText || '');
  const issues = [];
  const warnings = [];
  const details = [];
  const lower = response.toLowerCase();
  const taskType = context.codeType || context.taskType || 'general';
  const language = normalizeLanguage(context.language || '');
  const blocks = extractCodeBlocks(response);

  if (!response.trim()) {
    issues.push('empty_code_response');
  }

  // FIX: placeholder detection is slightly stricter and catches common LLM
  // cop-outs without punishing ordinary comments that explain future ideas.
  if (/\b(todo:\s*implement|rest of (?:the )?code here|implement later|placeholder(?: code)?|omitted for brevity|same as above)\b/i.test(response)) {
    issues.push('contains_placeholders');
  }

  if ((response.match(/```/g) || []).length % 2 !== 0) {
    issues.push('unclosed_code_fence');
  }

  if (taskType !== 'general' && !/(===file:|```)/i.test(response)) {
    issues.push('missing_code_block_or_file_delimiter');
  }

  if (!/how to run|setup|install|run:|npm install|npm run|pnpm |yarn |node |python |pip install|cargo run|go run|dotnet run|java |mvn |gradle |php |ruby |dart |flutter /i.test(lower)) {
    issues.push('missing_setup_guidance');
  }

  for (const block of blocks) {
    if (!hasBalancedDelimiters(block.code)) {
      issues.push('likely_syntax_error');
      details.push({ issue: 'likely_syntax_error', reason: 'unbalanced delimiters', block: block.filename || block.language || block.kind });
      break;
    }
    const syntaxIssue = verifyJavaScriptSyntax(block);
    if (syntaxIssue) {
      issues.push(syntaxIssue.issue);
      details.push({ ...syntaxIssue, block: block.filename || block.language || block.kind });
      break;
    }
  }

  if (detectLanguageMismatch(language, blocks)) {
    issues.push('language_mismatch');
  }

  if (language === 'sql' && /\bselect\s+\*\s+from\b/i.test(response)) {
    warnings.push('sql_select_star_warning');
  }

  if (/\b(auth|payment|database|credential|token|secret|migration)\b/i.test(String(context.userMessage || '')) && !/validation|error handling|security|parameterized|transaction|rollback|sanitize|encrypt/i.test(lower)) {
    issues.push('missing_sensitive_area_safeguards');
  }

  const uniqueIssues = [...new Set(issues)];
  const uniqueWarnings = [...new Set(warnings)];
  const score = Math.max(0, 100 - uniqueIssues.length * 22 - uniqueWarnings.length * 8);

  return {
    ok: uniqueIssues.length === 0,
    issues: uniqueIssues,
    warnings: uniqueWarnings,
    score,
    checkedBlocks: blocks.length,
    details
  };
}

module.exports = {
  verifyCodeResponse,
  extractCodeBlocks,
  hasBalancedDelimiters,
  detectLanguageMismatch
};
