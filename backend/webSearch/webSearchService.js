'use strict';

const crypto = require('crypto');
const path = require('path');
const { estimateTokens } = require('../ai/context/contextWindowManager');
const { detectSearchDecision } = require('./searchRouter');
const { planQueries, resolveUserQuestion } = require('./queryPlanner');
const { createSearchProvider } = require('./searchProviders');
const { filterSearchResultsWithReasons } = require('./resultFilter');
const { annotateSourceQuality } = require('./sourceQuality');
const { fetchPage } = require('./pageFetcher');
const { extractMainContent, detectSuspiciousInstructions } = require('./contentExtractor');
const { chunkPage, chunksFromSearchSnippets } = require('./chunker');
const { rerankChunks } = require('./reranker');
const { buildWebContext } = require('./contextBuilder');
const { buildCitations, estimateConfidence, buildSourcePanelSummary } = require('./citationBuilder');
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
    maxContextTokens,
    onProgress // optional callback for progressive steps (Phase 1): onProgress({step, ...})
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
        rejectedResults: [],
        pages: [],
        chunks: [],
        citations: [],
        contextText: '',
        confidence: 'medium',
        metrics: this.buildMetrics({ startedAt, confidence: 'medium' }),
        warnings: []
      };
    }

    const queries = planQueries(userMessage, decision, { messages });
    if (typeof onProgress === 'function') {
      onProgress({ step: 'queries_planned', count: queries.length, queries: queries.map(q => q.query || q) });
    }
    const provider = providedProvider || createSearchProvider(cfg, { fetchImpl: this.fetchImpl });
    const searchStarted = Date.now();
    const providerResponses = await Promise.allSettled(queries.map((query) =>
      provider.search(query.query, {
        maxResults: Math.max(3, Math.ceil(decision.maxResults / Math.max(1, queries.length))),
        allowedDomains: decision.allowedDomains,
        blockedDomains: decision.blockedDomains,
        freshnessRequired: decision.freshnessRequired,
        officialOnly: decision.officialOnly,
        researchMode: decision.mode === 'research_mode'
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

    const filtered = filterSearchResultsWithReasons(rawResults, decision);
    const filteredResults = filtered.accepted
      .map((result) => annotateSourceQuality(result, decision))
      .sort((a, b) => b.sourceQualityScore - a.sourceQualityScore);
    const rejectedResults = filtered.rejected;
    const searchLatencyMs = Date.now() - searchStarted;
    if (typeof onProgress === 'function') {
      onProgress({ step: 'search_complete', accepted: filteredResults.length, rejected: rejectedResults.length });
    }

    const fetchStarted = Date.now();
    const topResults = filteredResults.slice(0, decision.maxPagesToFetch);
    const fetchErrors = [];
    if (typeof onProgress === 'function') onProgress({ step: 'fetching_pages', count: topResults.length });
    const fetched = await Promise.all(topResults.map((result) => fetchPage(result.url, {
      fetchImpl: this.fetchImpl,
      lookup: this.lookup,
      sourceName: result.sourceName,
      publishedAt: result.publishedAt,
      timeoutMs: cfg.search?.fetchTimeoutMs,
      maxBytes: cfg.search?.maxPageBytes,
      onError: (error) => fetchErrors.push({
        url: error.url || result.url,
        title: result.title,
        domain: result.domain,
        error: error.error || error.message || String(error),
        code: error.code || 'FETCH_FAILED'
      })
    })));
    const qualityByUrl = new Map(filteredResults.map((result) => [result.url, result]));
    const pages = fetched.filter(Boolean)
      .map((page) => {
        const quality = qualityByUrl.get(page.url) || qualityByUrl.get(page.finalUrl) || {};
        return extractMainContent({
          ...page,
          sourceQualityScore: quality.sourceQualityScore || 55,
          qualitySignals: quality.qualitySignals || {},
          sourceId: quality.sourceId
        });
      })
      .filter((page) => String(page.text || '').length >= 80);
    const fetchLatencyMs = Date.now() - fetchStarted;

    let chunks = pages.flatMap((page) => chunkPage(page).map((chunk) => ({
      ...chunk,
      sourceQualityScore: page.sourceQualityScore || 55,
      qualitySignals: page.qualitySignals || {}
    })));
    const chunkUrls = new Set(chunks.map((chunk) => chunk.url));
    chunks.push(...chunksFromSearchSnippets(filteredResults.filter((result) => !chunkUrls.has(result.url))));

    const rerankStarted = Date.now();
    const reranked = rerankChunks({ userMessage: resolvedQuestion, chunks, decision });
    const rerankLatencyMs = Date.now() - rerankStarted;
    const packed = buildWebContext({
      chunks: reranked,
      maxTokens: maxContextTokens || (decision.mode === 'research_mode' ? 20000 : 12000),
      maxChunks: decision.mode === 'research_mode' ? 15 : 8,
      mode: decision.mode
    });
    const citations = buildCitations(packed.selectedChunks);
    const suspiciousSources = pages.flatMap((page) => {
      const matches = page.promptInjectionPatterns?.length ? page.promptInjectionPatterns : detectSuspiciousInstructions(page.text);
      return matches.length ? [{ url: page.finalUrl, title: page.title, patterns: matches }] : [];
    });
    const confidence = estimateConfidence({
      selectedChunks: packed.selectedChunks,
      citations,
      freshnessRequired: decision.freshnessRequired,
      suspiciousSources
    });
    const warnings = this.buildWarnings({ decision, citations, providerErrors, fetchErrors, confidence, suspiciousSources, rejectedResults });
    const metrics = this.buildMetrics({
      startedAt,
      queryCount: queries.length,
      resultCount: filteredResults.length,
      rejectedResultCount: rejectedResults.length,
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
    const fetchedPages = pages.map(({ text, ...page }) => ({
      ...page,
      textPreview: text.slice(0, 500),
      tokenCount: estimateTokens(text)
    }));
    const panelSummary = buildSourcePanelSummary({ decision, queries, citations, rejectedResults, fetchErrors, warnings });
    const run = this.store.save({
      userId,
      chatId,
      messageId,
      decision,
      queries,
      results: filteredResults,
      rejectedResults,
      fetchedPages,
      selectedChunks: packed.selectedChunks,
      citations,
      confidence,
      metrics,
      providerErrors,
      fetchErrors,
      suspiciousSources,
      warnings,
      panelSummary
    });

    return {
      success: packed.selectedChunks.length > 0,
      skipped: false,
      runId: run.id,
      decision,
      query: resolvedQuestion,
      queries,
      results: filteredResults,
      rejectedResults,
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
      warnings,
      panelSummary
    };
  }

  buildMetrics(values = {}) {
    const { startedAt = Date.now(), ...metrics } = values;
    return {
      queryCount: 0,
      resultCount: 0,
      rejectedResultCount: 0,
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

  buildWarnings({ decision, citations, providerErrors, fetchErrors, confidence, suspiciousSources = [], rejectedResults = [] }) {
    const warnings = [];
    if (!citations.length) warnings.push('No usable source evidence was selected.');
    if (decision.freshnessRequired && confidence === 'low') warnings.push('Fresh information could not be verified confidently.');
    if (providerErrors.length) warnings.push(`${providerErrors.length} search provider request(s) failed.`);
    if (fetchErrors.length) warnings.push(`${fetchErrors.length} page fetch(es) failed or were blocked.`);
    if (rejectedResults.length) warnings.push(`${rejectedResults.length} result(s) were rejected by URL/domain/source-quality filters.`);
    if (suspiciousSources.length) warnings.push('Suspicious webpage instructions were detected and treated as untrusted evidence.');
    return warnings;
  }
}

module.exports = { WebSearchService };
