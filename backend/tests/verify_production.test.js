'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// standard Node.js require hijacking to mock pg and redis without experimental flags
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'pg') {
    return {
      Pool: class MockPool {
        constructor() {
          this.queries = [];
        }
        async query(sql, params) {
          this.queries = this.queries || [];
          this.queries.push({ sql, params });
          if (sql.includes('schema_migrations')) {
            return { rows: [{ version: 1 }, { version: 2 }, { version: 3 }] };
          }
          if (sql.includes('SELECT 1')) {
            return { rows: [{ 1: 1 }] };
          }
          if (sql.includes('SELECT id, conversation_id, type')) {
            return {
              rows: [
                { id: 'mem-1', key: 'name', value: 'Alice', confidence: 0.9, type: 'personal_fact' }
              ]
            };
          }
          if (sql.includes('messages') || sql.includes('summaries')) {
            return { rows: [] };
          }
          return { rows: [], rowCount: 0 };
        }
        async connect() {
          return {
            query: async (sql, params) => this.query(sql, params),
            release: () => {}
          };
        }
        end() {
          return Promise.resolve();
        }
      }
    };
  }
  if (id === 'redis') {
    return {
      createClient: () => {
        const store = new Map();
        return {
          on: () => {},
          connect: () => Promise.resolve(),
          get: (key) => Promise.resolve(store.get(key) || null),
          set: (key, value) => {
            store.set(key, value);
            return Promise.resolve('OK');
          },
          del: (key) => {
            store.delete(key);
            return Promise.resolve(1);
          },
          multi: () => {
            const queue = [];
            return {
              zRemRangeByScore: () => queue.push('zrem'),
              zAdd: () => queue.push('zadd'),
              zCard: () => queue.push('zcard'),
              expire: () => queue.push('expire'),
              exec: () => Promise.resolve([0, 1, 1, 1])
            };
          },
          quit: () => Promise.resolve()
        };
      }
    };
  }
  if (id === 'express') {
    const mockExpress = () => {
      const app = (req, res) => {
        if (req.url === '/hazy/status' && app._routes['/hazy/status']) {
          app._routes['/hazy/status'](req, res);
        }
      };
      app._routes = {};
      app.use = () => {};
      app.post = (path, ...handlers) => {
        app._routes[path] = handlers[handlers.length - 1];
      };
      app.get = (path, ...handlers) => {
        app._routes[path] = handlers[handlers.length - 1];
      };
      app.delete = (path, ...handlers) => {
        app._routes[path] = handlers[handlers.length - 1];
      };
      return app;
    };
    mockExpress.json = () => (req, res, next) => next();
    return mockExpress;
  }
  if (id === 'cors') {
    return () => (req, res, next) => next();
  }
  if (id === 'morgan') {
    return () => (req, res, next) => next();
  }
  return originalRequire.apply(this, arguments);
};

test('db.js PostgreSQL pool and query interfaces work correctly', async () => {
  const db = require('../production/db');
  await db.migrate();
  
  const res = await db.query('SELECT 1');
  assert.equal(res.rows[0]['1'], 1);
});

test('cache.js Redis sliding window and get/set cache work correctly', async () => {
  const cache = require('../production/cache');
  await cache.connect();

  const setOk = await cache.set('test-key', 'hello');
  assert.equal(setOk, true);

  const val = await cache.get('test-key');
  assert.equal(val, 'hello');

  const rate = await cache.slidingWindowRateLimit('user-1', 5, 60);
  assert.equal(rate.allowed, true);
});

test('vectorStore.js pgvector store indexing and search work correctly', async () => {
  const { ProductionVectorSearch } = require('../production/vectorStore');
  
  const mockEmbeddingService = {
    embed: async (text) => [0.1, 0.2, 0.3]
  };

  const vectorStore = new ProductionVectorSearch({
    embeddingService: mockEmbeddingService
  });

  const results = await vectorStore.searchAsync('Alice', {
    userId: 'user-1',
    limit: 5
  });

  assert.ok(Array.isArray(results));
});

test('server.js Express server registers status and memory routes correctly', async () => {
  const { app } = require('../production/server');
  assert.ok(app);
  
  let resStatus = null;
  let resData = null;
  const mockReq = { method: 'GET', url: '/hazy/status', headers: {} };
  const mockRes = {
    setHeader: () => {},
    writeHead: (status) => { resStatus = status; },
    json: (data) => { resStatus = 200; resData = data; },
    status: (code) => {
      resStatus = code;
      return { json: (data) => { resData = data; } };
    }
  };
  
  app(mockReq, mockRes);
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assert.equal(resStatus, 200);
  assert.equal(resData.status, 'ok');
});

