'use strict';

const db = require('./db');
const cache = require('../cache/cache');
const { normalizeDenseVector } = require('../../../rag/embeddingService');

class ProductionVectorSearch {
  constructor(options = {}) {
    this.embeddingService = options.embeddingService || null;
  }

  async getEmbedding(text) {
    if (!text) return null;
    const cached = await cache.getCachedEmbedding(text);
    if (cached) return cached;

    if (this.embeddingService && typeof this.embeddingService.embed === 'function') {
      const embedding = await this.embeddingService.embed(text);
      if (embedding) {
        await cache.cacheEmbedding(text, embedding);
        return embedding;
      }
    }
    return null;
  }

  async addDocumentsAsync(chunks = [], options = {}) {
    const userId = options.userId || 'default';
    const projectId = options.projectId || '';
    const replaceFile = options.replaceFile !== false;
    
    const validChunks = chunks.filter(c => c && c.text);
    if (validChunks.length === 0) return;

    // Parallelize Redis cache check
    const cachePromises = validChunks.map(async (chunk) => {
      if (Array.isArray(chunk.embedding)) {
        return chunk.embedding;
      }
      return cache.getCachedEmbedding(chunk.text).catch(() => null);
    });
    const cachedEmbeddings = await Promise.all(cachePromises);

    // Filter chunks that still need embedding resolution
    const missingChunks = [];
    const missingIndices = [];
    validChunks.forEach((chunk, index) => {
      if (!cachedEmbeddings[index]) {
        missingChunks.push(chunk);
        missingIndices.push(index);
      }
    });

    // Batch resolve missing embeddings
    let resolvedEmbeddings = [];
    if (missingChunks.length > 0 && this.embeddingService) {
      if (typeof this.embeddingService.embedMany === 'function') {
        try {
          resolvedEmbeddings = await this.embeddingService.embedMany(missingChunks.map(c => c.text));
        } catch (err) {
          console.warn('[VectorStore] embedMany failed, falling back to parallel embed:', err.message);
          resolvedEmbeddings = await Promise.all(
            missingChunks.map(c => this.embeddingService.embed(c.text).catch(() => null))
          );
        }
      } else if (typeof this.embeddingService.embed === 'function') {
        resolvedEmbeddings = await Promise.all(
          missingChunks.map(c => this.embeddingService.embed(c.text).catch(() => null))
        );
      }
    }

    // Cache newly resolved embeddings in parallel (non-blocking write)
    const cacheWritePromises = [];
    missingChunks.forEach((chunk, i) => {
      const embedding = resolvedEmbeddings[i];
      if (embedding) {
        const origIndex = missingIndices[i];
        cachedEmbeddings[origIndex] = embedding;
        cacheWritePromises.push(cache.cacheEmbedding(chunk.text, embedding).catch(() => null));
      }
    });
    if (cacheWritePromises.length > 0) {
      Promise.all(cacheWritePromises).catch(() => {});
    }

    const withEmbeddings = validChunks.map((chunk, index) => ({
      ...chunk,
      embedding: cachedEmbeddings[index] || null
    }));

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      if (replaceFile) {
        const fileIds = [...new Set(withEmbeddings.map(c => c.fileId).filter(Boolean))];
        if (fileIds.length) {
          await client.query(
            "DELETE FROM memories WHERE user_id = $1 AND type = 'rag_chunk' AND project_id = $2 AND key IN (SELECT unnest($3::varchar[]))",
            [userId, projectId, fileIds]
          );
        }
      }

      // Bulk insert using a single query and parameterized inputs
      const values = [];
      const valueStrings = [];
      let paramIndex = 1;

      for (const item of withEmbeddings) {
        const fileId = item.fileId || 'document';
        const chunkIndex = item.chunkIndex ?? 0;
        const key = `${fileId}_chunk_${chunkIndex}`;
        const vectorStr = item.embedding ? `[${normalizeDenseVector(item.embedding).join(',')}]` : null;

        values.push(
          userId,
          projectId,
          item.conversationId || '',
          'rag_chunk',
          key,
          item.text,
          1.0, // confidence
          'normal', // sensitivity
          'active', // status
          vectorStr
        );

        valueStrings.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9})`);
        paramIndex += 10;
      }

      if (valueStrings.length > 0) {
        const bulkQueryText = `
          INSERT INTO memories(
            user_id, project_id, conversation_id, type, key, value,
            confidence, sensitivity, status, embedding, created_at, updated_at
          ) VALUES
          ${valueStrings.join(', ')}
          ON CONFLICT(user_id, project_id, type, key) DO UPDATE SET
            value = excluded.value,
            embedding = excluded.embedding,
            updated_at = CURRENT_TIMESTAMP
        `;

        await client.query(bulkQueryText, values);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[VectorStore] addDocumentsAsync failed:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  async addDocuments(chunks = [], options = {}) {
    return this.addDocumentsAsync(chunks, options).catch(err => {
      console.error('[VectorStore] addDocuments background task failed:', err.message);
    });
  }

  async deleteFile(fileId, userId = null) {
    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [fileId, userId] : [fileId];
    const res = await db.query(
      `DELETE FROM memories WHERE type = 'rag_chunk' AND key LIKE $1 || '_chunk_%' ${userClause}`,
      params
    );
    return res.rowCount;
  }

  async searchAsync(queryText = '', options = {}) {
    const userId = options.userId || 'default';
    const projectId = options.projectId || '';
    const limit = Math.max(1, Number(options.limit || 8));
    const embedding = await this.getEmbedding(queryText);

    if (!embedding) {
      const res = await db.query(
        `SELECT id, key, value, confidence FROM memories 
         WHERE user_id = $1 AND type = 'rag_chunk' AND status = 'active'
           AND (project_id = '' OR project_id = $2)
           AND value ILIKE $3
         LIMIT $4`,
        [userId, projectId, `%${queryText}%`, limit]
      );
      return res.rows.map(row => this.formatResult(row, 0.5));
    }

    const vectorStr = `[${normalizeDenseVector(embedding).join(',')}]`;
    const res = await db.query(
      `SELECT id, key, value, confidence,
              1 - (embedding <=> $1::vector) AS similarity
       FROM memories
       WHERE user_id = $2 AND type = 'rag_chunk' AND status = 'active'
         AND (project_id = '' OR project_id = $3)
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $4`,
      [vectorStr, userId, projectId, limit]
    );

    return res.rows.map(row => this.formatResult(row, row.similarity));
  }

  search(queryText = '', options = {}) {
    return [];
  }

  formatResult(row, score) {
    const parts = row.key.split('_chunk_');
    const fileId = parts[0] || 'document';
    const chunkIndex = parseInt(parts[1], 10) || 0;
    
    return {
      id: row.id,
      fileId,
      filename: fileId,
      text: row.value,
      chunkIndex,
      semanticScore: score,
      lexicalScore: 0.5,
      finalScore: score,
      score: score,
      citation: `[source: ${row.id}]`,
      summary: `[${fileId}] ${String(row.value || '').slice(0, 220).replace(/\s+/g, ' ')}`
    };
  }
}

module.exports = { ProductionVectorSearch };
