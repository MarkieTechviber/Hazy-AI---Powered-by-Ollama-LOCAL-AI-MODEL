'use strict';

function register(registry) {
  // Synthetic guardrail (never reaches execute) per Phase4 spec + REVERSE_ENGINEERING guardrails doc.
  // Attached post-def for register() side-effect pattern (smallest, no top-level mutation in module scope).
  // Guidance extracted to const to avoid dupe with replan language used in Phase2 iteration + other synthetics.
  const SYNTHETIC_GUIDANCE = {
    reason: 'Code execution tool is registered for future sandboxed use. Currently limited to calculator.evaluate for arithmetic. For complex logic read files with fs.read_file then propose edits via artifact.write + plan.manage.',
    suggestion: 'Replan: issues found or use current plan state and prior partial tool results. Use plan.manage list to replan or continue exactly where you left off.'
  };
  const def = {
    name: 'code.interpret',
    description: 'Limited code interpretation / safe eval in sandbox (currently provides guidance only; use calculator.evaluate for math).',
    risk: 'read',
    toolset: 'safe_default',
    requiresConfirmation: false,
    allowedRoles: ['admin', 'cashier', 'user'],
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 1, maxLength: 2000, description: 'Expression or small snippet (sandboxed)' }
      },
      required: ['code'],
      additionalProperties: false
    },
    execute: () => ({ ok: true, data: { note: 'not reached' } })
  };
  def.guardrail = () => ({ synthetic: true, ...SYNTHETIC_GUIDANCE });
  registry.register(def);
}

module.exports = { register };
