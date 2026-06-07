'use strict';

const crypto = require('crypto');
const path = require('path');
const { estimateTokens } = require('../ai/context/contextWindowManager');
const { detectSearchDecision } = require('./searchRouter');
const { planQueries, resolveUserQuestion } = require('./queryPlanner');
const { createSearchProvider } = require('./searchProviders');
const { filterSearchResults } = require('./resultFilter');
const { scoreSourceQuality } = require('./sourceQuality');
const { fetchPage } = require('./pageFetcher');
const { extractMainContent, detectSuspiciousInstructions } = require('./contentExtractor');
const { chunkPage, chunksFromSearchSnippets } = require('./chunker');
const { rerankChunks } = require('./reranker');
const { buildWebContext } = require('./contextBuilder');
const { buildCitations, estimateConfidence } = require('./citationBuilder');
const { SearchRunStore } = require('./searchRunStore');

class WebSearchService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
    this.lookup = options.lookup;
    this.store = options.store || new SearchRunStore(
      path.join(__dirname, '..', '..', 'cache', 'hazy-engine', 'web-search')
    );
  }

  async search({
    userMessage,
    messages = [],
    cfg = {},
    userId = 'local-user',
    chatId = 'default',
    messageId = crypto.randomUUID(),
    decision: providedDecision,
    provider: providedProvider,
    forceSearch,
    maxContextTokens
  }) {
    const startedAt = Date.now();
    const decision = providedDecision || detectSearchDecision(userMessage, { forceSearch });
    const resolvedQuestion = resolveUserQuestion(userMessage, messages);
    if (decision.mode === 'none') {
      return {
        success: false,
        skipped: true,
        decision,
        query: resolvedQuestion,
        queries: [],
        results: [],
        pages: [],
        chunks: [],
        citations: [],
        contextText: '',
        metrics: this.buildMetrics({ startedAt, confidence: 'medium' })
      };
    }

    const queries = planQueries(userMessage, decision, { messages });
    const provider = providedProvider || createSearchProvider(cfg, { fetchImpl: this.fetchImpl });
    const searchStarted = Date.now();
    const providerResponses = await Promise.allSettled(queries.map((query) =>
      provider.search(query.query, {
        maxResults: Math.max(3, Math.ceil(decision.maxResults / Math.max(1, queries.length))),
        allowedDomains: decision.allowedDomains,
        blockedDomains: decision.blockedDomains,
        freshnessRequired: decision.freshnessRequired
      })
    ));
    const rawResults = [];
    const providerErrors = [];
    const providersTried = new Set();
    providerResponses.forEach((response) => {
      if (response.status === 'rejected') {
        providerErrors.push({ provider: provider.name, error: response.reason?.message || String(response.reason) });
        return;
      }
      const payload = Array.isArray(response.value) ? { results: response.value } : response.value;
      rawResults.push(...(payload.results || []));
      (payload.errors || []).forEach((error) => providerErrors.push(error));
      (payload.providersTried || []).forEach((name) => providersTried.add(name));
    });
    const filteredResults = filterSearchResults(rawResults, decision)
      .map((result) => ({
        ...result,
        sourceQualityScore: scoreSourceQuality(result, decision)
      }))
      .sort((a, b) => b.sourceQualityScore - a.sourceQualityScore);
    const searchLatencyMs = Date.now() - searchStarted;

    const fetchStarted = Date.now();
    const topResults = filteredResults.slice(0, decision.maxPagesToFetch);
    const fetchErrors = [];
    const fetched = await Promise.all(topResults.map((result) => fetchPage(result.url, {
      fetchImpl: this.fetchImpl,
      lookup: this.lookup,
      sourceName: result.sourceName,
      publishedAt: result.publishedAt,
      onError: (error) => fetchErrors.push({ url: result.url, error: error.message })
    })));
    const pages = fetched.filter(Boolean)
      .map(extractMainContent)
      .filter((page) => page.text.length >= 80);
    const fetchLatencyMs = Date.now() - fetchStarted;

    const qualityByUrl = new Map(filteredResults.map((result) => [result.url, result.sourceQualityScore]));
    let chunks = pages.flatMap((page) => chunkPage(page).map((chunk) => ({
      ...chunk,
      sourceQualityScore: qualityByUrl.get(page.url) || qualityByUrl.get(page.finalUrl) || 55
    })));
    const chunkUrls = new Set(chunks.map((chunk) => chunk.url));
    chunks.push(...chunksFromSearchSnippets(
      filteredResults.filter((result) => !chunkUrls.has(result.url))
    ));

    const rerankStarted = Date.now();
    const reranked = rerankChunks({ userMessage: resolvedQuestion, chunks, decision });
    const rerankLatencyMs = Date.now() - rerankStarted;
    const packed = buildWebContext({
      chunks: reranked,
      maxTokens: maxContextTokens || (decision.mode === 'deep_web' ? 20000 : 12000),
      maxChunks: decision.mode === 'deep_web' ? 15 : 8
    });
    const citations = buildCitations(packed.selectedChunks);
    const confidence = estimateConfidence({
      selectedChunks: packed.selectedChunks,
      citations,
      freshnessRequired: decision.freshnessRequired
    });
    const suspiciousSources = pages.flatMap((page) => {
      const matches = detectSuspiciousInstructions(page.text);
      return matches.length ? [{ url: page.finalUrl, patterns: matches }] : [];
    });
    const metrics = this.buildMetrics({
      startedAt,
      queryCount: queries.length,
      resultCount: filteredResults.length,
      fetchedPageCount: pages.length,
      selectedChunkCount: packed.selectedChunks.length,
      failedFetchCount: topResults.length - pages.length,
      searchLatencyMs,
      fetchLatencyMs,
      rerankLatencyMs,
      estimatedInputTokens: estimateTokens(resolvedQuestion) + packed.tokenCount,
      citationCount: citations.length,
      confidence
    });
    const run = this.store.save({
      userId,
      chatId,
      messageId,
      decision,
      queries,
      results: filteredResults,
      fetchedPages: pages.map(({ text, ...page }) => ({
        ...page,
        textPreview: text.slice(0, 500),
        tokenCount: estimateTokens(text)
      })),
      selectedChunks: packed.selectedChunks,
      citations,
      metrics,
      providerErrors,
      fetchErrors,
      suspiciousSources
    });

    return {
      success: packed.selectedChunks.length > 0,
      skipped: false,
      runId: run.id,
      decision,
      query: resolvedQuestion,
      queries,
      results: filteredResults,
      pages,
      chunks: packed.selectedChunks,
      citations,
      contextText: packed.contextText,
      confidence,
      providersTried: Array.from(providersTried),
      providerErrors,
      fetchErrors,
      suspiciousSources,
      metrics,
      warnings: this.buildWarnings({ decision, citations, providerErrors, fetchErrors, confidence })
    };
  }

  buildMetrics(values = {}) {
    const { startedAt = Date.now(), ...metrics } = values;
    return {
      queryCount: 0,
      resultCount: 0,
      fetchedPageCount: 0,
      selectedChunkCount: 0,
      failedFetchCount: 0,
      searchLatencyMs: 0,
      fetchLatencyMs: 0,
      rerankLatencyMs: 0,
      answerLatencyMs: 0,
      totalLatencyMs: Date.now() - startedAt,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      citationCount: 0,
      confidence: 'low',
      ...metrics
    };
  }

  buildWarnings({ decision, citations, providerErrors, fetchErrors, confidence }) {
    const warnings = [];
    if (!citations.length) warnings.push('No usable source evidence was selected.');
    if (decision.freshnessRequired && confidence === 'low') warnings.push('Fresh information could not be verified confidently.');
    if (providerErrors.length) warnings.push(`${providerErrors.length} search provider request(s) failed.`);
    if (fetchErrors.length) warnings.push(`${fetchErrors.length} page fetch(es) failed or were blocked.`);
    return warnings;
  }
}

module.exports = { WebSearchService };
