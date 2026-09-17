'use strict';
// Each test worker owns synthetic state. Never migrate/read the user's cache.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hazy-test-'));
process.env.HAZY_DATA_DIR = path.join(root, 'data');
process.env.HAZY_CONFIG_DIR = path.join(root, 'config');
process.env.HAZY_TEST_MODE = '1';
process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });
