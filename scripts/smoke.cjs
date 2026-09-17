'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hazy-smoke-'));
process.env.HAZY_DATA_DIR = scratch;
process.env.HAZY_CONFIG_DIR = path.join(scratch, 'config');

const { server } = require('../backend/server');

async function main() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const [basic, detailed, home, logo] = await Promise.all([
    fetch(`${base}/health`), fetch(`${base}/hazy/health`), fetch(base),
    fetch(`${base}/assets/logos/hazy_logo_ink_transparent.svg`)
  ]);
  assert.equal(basic.status, 200);
  assert.equal((await basic.json()).status, 'ok');
  assert.equal(detailed.status, 200);
  assert.equal((await detailed.json()).runtime, 'node');
  assert.match(await home.text(), /runtime-status\.js/);
  assert.equal(logo.status, 200);
  assert.equal((await fetch(`${base}/bad%ZZ`)).status, 400);
  assert.equal((await fetch(`${base}/health`, { headers: { origin: 'https://attacker.example' } })).status, 403);
  console.log(`Startup smoke passed on loopback port ${port}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await new Promise(resolve => server.close(resolve));
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
});
