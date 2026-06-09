'use strict';

const net = require('net');

const SENSITIVE_VALUE = '[REDACTED]';
const PRIVATE_HOSTS = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);
const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.lan'];

function toText(value) {
  return String(value ?? '');
}

function isIPv4Private(hostname) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 0;
}

function isIPv6Private(hostname) {
  const host = hostname.toLowerCase();
  return host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe80:')
    || host === '::';
}

function isLocalHostname(hostname) {
  const host = toText(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return PRIVATE_HOSTS.has(host) || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function classifyUrl(rawUrl, options = {}) {
  if (!rawUrl) return { allowed: false, code: 'URL_REQUIRED', message: 'A URL is required.' };

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, code: 'INVALID_URL', message: 'The URL is not valid.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (protocol === 'file:') {
    return { allowed: false, code: 'FILE_URL_BLOCKED', message: 'File URLs are blocked for browser automation.' };
  }
  if (!['http:', 'https:'].includes(protocol)) {
    return { allowed: false, code: 'UNSUPPORTED_PROTOCOL', message: 'Only HTTP and HTTPS URLs are allowed.' };
  }

  const allowLocalhost = options.allowLocalhost === true || process.env.HAZY_BROWSER_ALLOW_LOCALHOST === '1';
  const allowPrivateNetwork = options.allowPrivateNetwork === true || process.env.HAZY_BROWSER_ALLOW_PRIVATE_NETWORK === '1';
  const ipVersion = net.isIP(hostname);
  const isLocal = isLocalHostname(hostname) || (ipVersion === 4 && hostname.startsWith('127.')) || (ipVersion === 6 && hostname === '::1');
  const isPrivate = isLocal
    || (ipVersion === 4 && isIPv4Private(hostname))
    || (ipVersion === 6 && isIPv6Private(hostname));

  if (isLocal && !allowLocalhost) {
    return { allowed: false, code: 'LOCALHOST_BLOCKED', message: 'Localhost browser targets are blocked unless explicitly enabled.' };
  }
  if (isPrivate && !isLocal && !allowPrivateNetwork) {
    return { allowed: false, code: 'PRIVATE_NETWORK_BLOCKED', message: 'Private network browser targets are blocked by default.' };
  }

  return { allowed: true, url: parsed.toString(), hostname, protocol };
}

function looksSensitiveKey(name = '') {
  return /(password|passcode|secret|token|api[_-]?key|private[_-]?key|authorization|credential|otp|2fa|mfa)/i.test(name);
}

function looksPersonalData(name = '', value = '') {
  const joined = `${name} ${value}`;
  return /(email|phone|address|birth|ssn|passport|driver|card|cvv|billing|shipping|full.?name)/i.test(joined);
}

function looksPurchaseOrAccountAction(text = '') {
  return /(buy|purchase|checkout|place order|subscribe|confirm order|pay now|delete account|change password|change email|cancel plan|upgrade|downgrade|transfer|withdraw|submit application)/i
    .test(toText(text));
}

function requiresConfirmation(action = {}, pageState = {}) {
  const type = toText(action.type || action.action).toLowerCase();
  const selector = toText(action.selector);
  const text = toText(action.text || action.value || action.label || selector);
  const lowerSelector = selector.toLowerCase();
  const pageText = toText(pageState.visibleTextSummary || pageState.pageTitle || '');

  if (type === 'type') {
    if (looksSensitiveKey(selector) || looksSensitiveKey(action.fieldName) || looksSensitiveKey(text)) {
      return {
        required: true,
        code: 'SENSITIVE_INPUT_CONFIRMATION',
        message: 'Typing passwords, API keys, tokens, or other secrets requires explicit user action.'
      };
    }
    if (looksPersonalData(selector, text)) {
      return {
        required: true,
        code: 'PERSONAL_DATA_CONFIRMATION',
        message: 'Entering personal data requires confirmation.'
      };
    }
  }

  if (type === 'click') {
    if (/submit|button/.test(lowerSelector) || looksPurchaseOrAccountAction(`${text} ${pageText}`)) {
      return {
        required: true,
        code: 'RISKY_CLICK_CONFIRMATION',
        message: 'Submitting forms, purchases, or account changes requires confirmation.'
      };
    }
  }

  if (type === 'select' && looksPersonalData(selector, text)) {
    return {
      required: true,
      code: 'PERSONAL_DATA_CONFIRMATION',
      message: 'Selecting personal account or billing data requires confirmation.'
    };
  }

  return { required: false };
}

function detectPageWarnings(observation = {}) {
  const text = `${observation.pageTitle || ''}\n${observation.visibleTextSummary || ''}`.toLowerCase();
  const warnings = [];
  if (/(captcha|verify you are human|cloudflare challenge)/i.test(text)) warnings.push('CAPTCHA or bot challenge detected. Hazy will not bypass access controls.');
  if (/(log in|sign in|password)/i.test(text)) warnings.push('Login or password fields detected. Hazy will not enter credentials without explicit user action.');
  if (/(paywall|subscribe to continue|members only)/i.test(text)) warnings.push('Paywall or member-only access language detected. Hazy will not bypass access controls.');
  if (/(checkout|payment|billing|place order|cart)/i.test(text)) warnings.push('Purchase or billing flow detected. Confirmation is required before risky actions.');
  return warnings;
}

function redactValue(value) {
  const text = toText(value);
  if (!text) return text;
  if (looksSensitiveKey(text) || text.length > 80) return SENSITIVE_VALUE;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUMBER]');
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      looksSensitiveKey(key) ? SENSITIVE_VALUE : redactObject(item)
    ]));
  }
  return typeof value === 'string' ? redactValue(value) : value;
}

module.exports = {
  classifyUrl,
  detectPageWarnings,
  redactObject,
  redactValue,
  requiresConfirmation,
  SENSITIVE_VALUE
};
