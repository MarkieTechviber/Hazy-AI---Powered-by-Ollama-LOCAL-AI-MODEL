const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

function freshServerRequire() {
  const serverPath = path.resolve(__dirname, '../server.js');
  const srcServerPath = path.resolve(__dirname, '../src/infrastructure/web/server.js');
  delete require.cache[serverPath];
  delete require.cache[srcServerPath];
  return require(serverPath);
}

test('getCpuUsage calculates CPU ticks correctly', () => {
  const mod = freshServerRequire();
  // First call sets lastCpuTimes and returns 0
  const first = mod.getCpuUsage();
  assert.equal(first, 0);

  // Subsequent call will calculate delta based on static/growing ticks
  const second = mod.getCpuUsage();
  assert.equal(typeof second, 'number');
  assert.ok(second >= 0 && second <= 100);
});

test('parseDetailedNvidiaSmi handles single-GPU CSV string correctly', () => {
  const mod = freshServerRequire();
  const parse = mod.parseDetailedNvidiaSmi;

  // Good
  const good = 'NVIDIA GeForce RTX 4090, 24, 4096, 24576, 52';
  const parsed = parse(good);
  assert.ok(parsed);
  assert.equal(parsed.name, 'NVIDIA GeForce RTX 4090');
  assert.equal(parsed.utilization, 24);
  assert.equal(parsed.vramUsedMB, 4096);
  assert.equal(parsed.vramTotalMB, 24576);
  assert.equal(parsed.temperature, 52);

  // Bad structure
  assert.equal(parse(''), null);
  assert.equal(parse(null), null);
  assert.equal(parse('NVIDIA RTX, notanumber, 12, 12, 12'), null);
  assert.equal(parse('NVIDIA RTX, 10, 10, 10'), null); // Missing temperature
});

test('getOllamaStats handles offline status', async () => {
  const mod = freshServerRequire();
  const originalFetch = global.fetch;

  // Simulate network failure
  global.fetch = async () => {
    throw new Error('Connect ECONNREFUSED');
  };

  try {
    const stats = await mod.getOllamaStats({});
    assert.equal(stats.status, 'offline');
    assert.equal(stats.version, 'unknown');
    assert.deepEqual(stats.loadedModels, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('getOllamaStats maps loaded models and percentages when online', async () => {
  const mod = freshServerRequire();
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/tags')) {
      return { ok: true };
    }
    if (urlStr.includes('/api/version')) {
      return { ok: true, json: async () => ({ version: '0.1.48' }) };
    }
    if (urlStr.includes('/api/ps')) {
      return {
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'llama3.2:latest',
              size: 2000000,
              size_vram: 1500000
            },
            {
              name: 'qwen:latest',
              size: 4000000,
              size_vram: 4000000
            }
          ]
        })
      };
    }
    return { ok: false };
  };

  try {
    const stats = await mod.getOllamaStats({});
    assert.equal(stats.status, 'online');
    assert.equal(stats.version, '0.1.48');
    assert.equal(stats.loadedModels.length, 2);
    
    assert.equal(stats.loadedModels[0].name, 'llama3.2:latest');
    assert.equal(stats.loadedModels[0].gpuPercentage, 75); // 1.5M / 2.0M * 100
    
    assert.equal(stats.loadedModels[1].name, 'qwen:latest');
    assert.equal(stats.loadedModels[1].gpuPercentage, 100);
  } finally {
    global.fetch = originalFetch;
  }
});

test('gatherAllMetrics returns unified payload structure', async () => {
  const mod = freshServerRequire();
  const originalFetch = global.fetch;

  global.fetch = async () => {
    return { ok: true, json: async () => ({ models: [] }) };
  };

  try {
    const payload = await mod.gatherAllMetrics({});
    assert.ok(payload);
    assert.ok(payload.timestamp);
    assert.ok(payload.status);
    assert.ok(payload.system);
    assert.equal(typeof payload.system.cpuPercentage, 'number');
    assert.equal(typeof payload.system.ramTotalGB, 'number');
    assert.equal(typeof payload.system.ramUsedGB, 'number');
    assert.equal(typeof payload.system.processMemoryMB, 'number');
  } finally {
    global.fetch = originalFetch;
  }
});

test('getGpuStats returns a promise and handles lack of nvidia-smi safely', async () => {
  const mod = freshServerRequire();
  const gpu = await mod.getGpuStats();
  if (gpu !== null) {
    assert.ok(gpu.name);
    assert.equal(typeof gpu.utilization, 'number');
    assert.equal(typeof gpu.vramUsedMB, 'number');
    assert.equal(typeof gpu.vramTotalMB, 'number');
    assert.equal(typeof gpu.temperature, 'number');
  } else {
    assert.equal(gpu, null);
  }
});

