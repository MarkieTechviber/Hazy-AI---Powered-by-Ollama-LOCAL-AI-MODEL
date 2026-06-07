'use strict';

const TOKEN_PATTERN = /\s*(\d+(?:\.\d+)?|[()+\-*/])\s*/gy;

function tokenize(expression) {
  const text = String(expression || '');
  const tokens = [];
  let cursor = 0;

  while (cursor < text.length) {
    TOKEN_PATTERN.lastIndex = cursor;
    const match = TOKEN_PATTERN.exec(text);
    if (!match || match.index !== cursor) {
      throw new Error('Unsupported arithmetic expression');
    }
    tokens.push(match[1]);
    cursor = TOKEN_PATTERN.lastIndex;
  }
  return tokens;
}

function evaluateArithmetic(expression) {
  const tokens = tokenize(expression);
  let index = 0;

  function parsePrimary() {
    const token = tokens[index++];
    if (token === '(') {
      const value = parseAdditive();
      if (tokens[index++] !== ')') throw new Error('Unbalanced parentheses');
      return value;
    }
    if (token === '+' || token === '-') {
      const value = parsePrimary();
      return token === '-' ? -value : value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Invalid number');
    return value;
  }

  function parseMultiplicative() {
    let value = parsePrimary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = parsePrimary();
      if (operator === '/' && right === 0) throw new Error('Division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  if (!tokens.length) throw new Error('Empty arithmetic expression');
  const result = parseAdditive();
  if (index !== tokens.length || !Number.isFinite(result)) {
    throw new Error('Invalid arithmetic expression');
  }
  return result;
}

function verifyVisibleEquations(text, tolerance = 0.000001) {
  const equationPattern = /(^|[^\w.])([()+\-*/\d.\s]{3,})\s*=\s*(-?\d+(?:\.\d+)?)/g;
  const checks = [];
  let match;

  while ((match = equationPattern.exec(String(text || ''))) !== null) {
    const expression = match[2].trim();
    const stated = Number(match[3]);
    try {
      const computed = evaluateArithmetic(expression);
      checks.push({
        expression,
        stated,
        computed,
        valid: Math.abs(computed - stated) <= tolerance
      });
    } catch {
      // Ignore prose fragments that happen to resemble equations.
    }
  }

  return checks;
}

module.exports = {
  evaluateArithmetic,
  verifyVisibleEquations
};
