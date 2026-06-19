'use strict';

const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({
  url: REDIS_URL
});

client.on('error', err => console.error('[Redis Client Error]', err));

let isConnected = false;

async function connect() {
  if (isConnected) return;
  await client.connect();
  isConnected = true;
  console.log('[Redis] Connected successfully.');
}

async function get(key) {
  await connect();
  try {
    return await client.get(key);
  } catch (err) {
    console.warn('[Redis] get failed:', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds = 1800) {
  await connect();
  try {
    await client.set(key, String(value), {
      EX: ttlSeconds
    });
    return true;
  } catch (err) {
    console.warn('[Redis] set failed:', err.message);
    return false;
  }
}

async function del(key) {
  await connect();
  try {
    await client.del(key);
    return true;
  } catch (err) {
    console.warn('[Redis] del failed:', err.message);
    return false;
  }
}

async function getCachedPreferences(userId) {
  const data = await get(`hazy:user:${userId}:preferences`);
  return data ? JSON.parse(data) : null;
}

async function cachePreferences(userId, prefs, ttl = 1800) {
  return set(`hazy:user:${userId}:preferences`, JSON.stringify(prefs), ttl);
}

async function getCachedChatHistory(chatId) {
  const data = await get(`hazy:chat:${chatId}:history`);
  return data ? JSON.parse(data) : null;
}

async function cacheChatHistory(chatId, history, ttl = 3600) {
  return set(`hazy:chat:${chatId}:history`, JSON.stringify(history), ttl);
}

async function slidingWindowRateLimit(key, limit, windowSeconds) {
  await connect();
  const now = Date.now();
  const clearBefore = now - (windowSeconds * 1000);
  const redisKey = `hazy:ratelimit:${key}`;

  try {
    const multi = client.multi();
    multi.zRemRangeByScore(redisKey, 0, clearBefore);
    multi.zAdd(redisKey, { score: now, value: String(now) });
    multi.zCard(redisKey);
    multi.expire(redisKey, windowSeconds);
    
    const results = await multi.exec();
    const requestCount = results[2];
    
    return {
      allowed: requestCount <= limit,
      remaining: Math.max(0, limit - requestCount),
      count: requestCount
    };
  } catch (err) {
    console.warn('[Redis] slidingWindowRateLimit failed, falling back:', err.message);
    return { allowed: true, remaining: 1, count: 1 };
  }
}

function getPromptHash(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

async function getCachedEmbedding(text) {
  const hash = getPromptHash(text);
  const data = await get(`hazy:embedding:${hash}`);
  return data ? JSON.parse(data) : null;
}

async function cacheEmbedding(text, embedding, ttl = 86400) {
  const hash = getPromptHash(text);
  return set(`hazy:embedding:${hash}`, JSON.stringify(embedding), ttl);
}

module.exports = {
  client,
  connect,
  get,
  set,
  del,
  getCachedPreferences,
  cachePreferences,
  getCachedChatHistory,
  cacheChatHistory,
  slidingWindowRateLimit,
  getCachedEmbedding,
  cacheEmbedding,
  close: () => client.quit(),
};
