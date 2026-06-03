'use strict';

function verifyCodeResponse(responseText, context = {}) {
  const response = String(responseText || '');
  const issues = [];
  const lower = response.toLowerCase();
  const taskType = context.codeType || context.taskType || 'general';

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
