'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { requestAllowed, readJsonBody } = require('../security/httpBoundary');

function request({ body = '', headers = {}, method = 'POST' } = {}) {
  const stream = Readable.from([Buffer.from(body)]);
  stream.headers = headers;
  stream.method = method;
  stream.socket = { remoteAddress: '127.0.0.1' };
  return stream;
}

test('HTTP boundary accepts the configured loopback origin and rejects hostile hosts/origins', () => {
  assert.equal(requestAllowed(request({ headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' } }), { host: '127.0.0.1', port: 8080 }), true);
  assert.equal(requestAllowed(request({ headers: { host: 'attacker.example:8080' } }), { host: '127.0.0.1', port: 8080 }), false);
  assert.equal(requestAllowed(request({ headers: { host: '127.0.0.1:8080', origin: 'https://attacker.example' } }), { host: '127.0.0.1', port: 8080 }), false);
});

test('JSON reader accepts objects and rejects arrays, malformed data, forbidden keys and excess bytes', async () => {
  assert.deepEqual(await readJsonBody(request({ body: '{"ok":true}' }), { maxBytes: 128 }), { ok: true });
  await assert.rejects(() => readJsonBody(request({ body: '[]' }), { maxBytes: 128 }), error => error.statusCode === 400);
  await assert.rejects(() => readJsonBody(request({ body: '{' }), { maxBytes: 128 }), error => error.statusCode === 400);
  await assert.rejects(() => readJsonBody(request({ body: '{"nested":{"constructor":{}}}' }), { maxBytes: 128 }), error => error.statusCode === 400);
  await assert.rejects(() => readJsonBody(request({ body: JSON.stringify({ value: 'x'.repeat(200) }) }), { maxBytes: 64 }), error => error.statusCode === 413);
  await assert.rejects(() => readJsonBody(request({ body: '{}', headers: { 'content-type': 'text/plain' } })), error => error.statusCode === 415);
});
