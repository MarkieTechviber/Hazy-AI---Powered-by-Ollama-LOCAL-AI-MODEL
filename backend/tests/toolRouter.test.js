'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { wantsWebSearch, extractSearchQuery, isAgentEnabled } = require('../tools/toolRouter');

test('detects direct web search intent', () => {
  assert.equal(wantsWebSearch('Can you search online about the song "MIRAI-E"?'), true);
  assert.equal(wantsWebSearch('Look up latest React release notes'), true);
  assert.equal(wantsWebSearch('Explain binary search in Python'), false);
});

test('extracts clean search query from user prompt', () => {
  assert.equal(extractSearchQuery('Can you search online about the song "MIRAI-E"?'), 'MIRAI-E song');
  assert.equal(extractSearchQuery('Can you search online about the song \u201cMIRAI-E\u201d?'), 'MIRAI-E song');
  assert.equal(extractSearchQuery('CAN YOU SEARCH ON INTERNET ABOUT THE SONG ?MIRAI-E?'), 'MIRAI-E song');
  assert.equal(extractSearchQuery('please look up latest Vite release'), 'latest Vite release');
});

test('agent enabled can come from hazy metadata', () => {
  assert.equal(isAgentEnabled({ hazy: { agentEnabled: true } }), true);
  assert.equal(isAgentEnabled({ hazy: { agentEnabled: false } }), false);
});
