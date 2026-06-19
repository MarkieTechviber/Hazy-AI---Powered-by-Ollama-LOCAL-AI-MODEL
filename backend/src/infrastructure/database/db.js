'use strict';

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://hazy_user:hazy_password@localhost:5432/hazy_db';

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        project_id VARCHAR(128) NOT NULL DEFAULT '',
        title VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        analysis_json JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
        ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_summaries_conversation_created
        ON conversation_summaries(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(64) NOT NULL,
        project_id VARCHAR(128) NOT NULL DEFAULT '',
        conversation_id VARCHAR(64) NOT NULL DEFAULT '',
        type VARCHAR(50) NOT NULL,
        key VARCHAR(120) NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        sensitivity VARCHAR(20) NOT NULL DEFAULT 'normal',
        source_message_id UUID,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(user_id, project_id, type, key)
      );

      CREATE INDEX IF NOT EXISTS idx_memories_lookup
        ON memories(user_id, project_id, status, confidence DESC, updated_at DESC);

      CREATE TABLE IF NOT EXISTS provider_secrets (
        provider VARCHAR(50) PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_states (
        conversation_id VARCHAR(64) PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL,
        state_json JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_states_user_updated
        ON conversation_states(user_id, updated_at DESC);
    `
  },
  {
    version: 3,
    sql: `
      CREATE EXTENSION IF NOT EXISTS vector;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding VECTOR(768);
      CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
    `
  }
];

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(r => r.version));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      
      console.log(`[Database] Applying migration v${migration.version}...`);
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations(version) VALUES ($1)',
        [migration.version]
      );
    }
    await client.query('COMMIT');
    console.log('[Database] Migrations verified successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Database] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  migrate,
  close: () => pool.end(),
};
