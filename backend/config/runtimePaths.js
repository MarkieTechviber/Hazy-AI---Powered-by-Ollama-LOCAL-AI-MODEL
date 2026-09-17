'use strict';

const path = require('node:path');
const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.resolve(process.env.HAZY_DATA_DIR || path.join(ROOT_DIR, 'cache', 'hazy-engine'));
const CONFIG_DIR = path.resolve(process.env.HAZY_CONFIG_DIR || path.join(ROOT_DIR, 'config'));
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
module.exports = { ROOT_DIR, DATA_DIR, CONFIG_DIR, ARTIFACTS_DIR };
