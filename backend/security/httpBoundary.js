'use strict';

function requestAllowed(req, { host = 'localhost', port = 8080, allowedOrigin } = {}) {
  const actualPort = req.socket?.localPort || port;
  const origins = new Set([
    `http://localhost:${actualPort}`, `http://127.0.0.1:${actualPort}`,
    `http://[::1]:${actualPort}`, `http://${host}:${actualPort}`
  ]);
  if (allowedOrigin && allowedOrigin !== '*') origins.add(allowedOrigin);
  const hosts = new Set([...origins].map(origin => new URL(origin).host));
  if (!hosts.has(String(req.headers.host || '').toLowerCase())) return false;
  if (req.headers.origin && !origins.has(req.headers.origin)) return false;
  if (!req.headers.origin && req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}

function assertJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('JSON body must be an object.'), { statusCode: 400 });
  }
  const visit = (node, depth) => {
    if (depth > 40) throw Object.assign(new Error('JSON nesting limit exceeded.'), { statusCode: 400 });
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw Object.assign(new Error('Unsafe JSON property.'), { statusCode: 400 });
      }
      visit(node[key], depth + 1);
    }
  };
  visit(value, 0);
  return value;
}

function readJsonBody(req, { maxBytes } = {}) {
  const configured = Number(process.env.HAZY_MAX_BODY_BYTES);
  const explicit = Number(maxBytes);
  const max = Number.isFinite(explicit) && explicit > 0
    ? Math.min(explicit, 20 * 1024 * 1024)
    : Number.isFinite(configured) && configured > 0
      ? Math.max(65536, Math.min(configured, 20 * 1024 * 1024)) : 5 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    let failed = false;
    const fail = (message, statusCode) => {
      if (failed) return;
      failed = true;
      chunks.length = 0;
      reject(Object.assign(new Error(message), { statusCode }));
    };
    const contentType = String(req.headers?.['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      req.resume(); fail('Content-Type must be application/json.', 415); return;
    }
    if (Number(req.headers?.['content-length']) > max) {
      req.resume(); fail('Request body too large.', 413); return;
    }
    req.on('data', chunk => {
      if (failed) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > max) { fail('Request body too large.', 413); return; }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(assertJsonObject(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))); }
      catch (error) { fail(error.statusCode ? error.message : 'Malformed JSON request body.', 400); }
    });
    req.on('aborted', () => fail('Request aborted.', 400));
    req.on('error', () => fail('Request read failed.', 400));
  });
}

module.exports = { requestAllowed, assertJsonObject, readJsonBody };
