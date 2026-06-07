'use strict';

function verifyCodeResponse(responseText, context = {}) {
  const response = String(responseText || '');
  const issues = [];
  const lower = response.toLowerCase();
  const taskType = context.codeType || context.taskType || 'general';
  const language = String(context.language || '').toLowerCase();

  function extractCode() {
    const fileMatch = response.match(/===FILE:[^\n=]+===\s*([\s\S]*?)(?=\n===|$)/i);
    if (fileMatch?.[1]) return fileMatch[1].trim();

    const fenceMatch = response.match(/```[a-z0-9_-]*\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) return fenceMatch[1].trim();

    return response.trim();
  }

  function hasBalancedDelimiters(code) {
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const closing = new Set(Object.values(pairs));
    const stack = [];
    let quote = null;
    let escaped = false;

    for (const char of code) {
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
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (pairs[char]) {
        stack.push(pairs[char]);
      } else if (closing.has(char) && stack.pop() !== char) {
        return false;
      }
    }

    return stack.length === 0 && quote === null;
  }

  if (!response.trim()) {
    issues.push('empty_code_response');
  }

  if (/(todo|rest of code here|implement later|placeholder)/i.test(response)) {
    issues.push('contains_placeholders');
  }

  if (taskType !== 'general' && /(===file:|```)/i.test(response) === false) {
    issues.push('missing_code_block_or_file_delimiter');
  }

  if (!/how to run|setup|npm install|node |python |cargo run|go run/i.test(lower)) {
    issues.push('missing_setup_guidance');
  }

  const code = extractCode();
  if (code && !hasBalancedDelimiters(code)) {
    issues.push('likely_syntax_error');
  }

  if (language === 'python' && /\b(const|let|function)\b|=>|console\.log/i.test(code)) {
    issues.push('language_mismatch');
  }

  if ((language === 'javascript' || language === 'typescript') && /^\s*(def|import\s+\w+|print\()/m.test(code)) {
    issues.push('language_mismatch');
  }

  if (context.language === 'sql' && /\bselect \* from\b/i.test(response)) {
    issues.push('sql_select_star_warning');
  }

  if (/\b(auth|payment|database)\b/i.test(String(context.userMessage || '')) && !/validation|error handling|security|parameterized/i.test(lower)) {
    issues.push('missing_sensitive_area_safeguards');
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

module.exports = { verifyCodeResponse };
