'use strict';

const DEFAULT_TIMEOUT_MS = 9000;

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'HazyResearch/1.1 (+local-first; safe-fetch)',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      body: options.body,
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) throw new Error(`${response.status} ${data?.message || data?.error || text.slice(0, 160)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function getDomain(rawUrl = '') {
  try { return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function hostnameAllowed(url, options = {}) {
  try {
    const host = getDomain(url);
    const allowed = options.allowedDomains || [];
    const blocked = options.blockedDomains || [];
    if (allowed.length && !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    if (blocked.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = String(value).trim();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text.slice(0, 80);
}

function normalizeResult(item, index, providerName) {
  const rawUrl = String(item.url || item.link || '').trim().slice(0, 1200);
  const domain = getDomain(rawUrl);
  const title = String(item.title || item.name || domain || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const snippet = String(item.snippet || item.description || item.content || item.text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400);
  const rawRank = Number(item.rawRank || item.rank || index + 1);
  return {
    title,
    url: rawUrl,
    snippet,
    domain,
    sourceName: String(item.sourceName || item.source || domain || providerName || '').trim().slice(0, 120),
    publishedAt: normalizeDate(item.publishedAt || item.published_at || item.date || item.age),
    providerName,
    provider: providerName,
    rawRank,
    rank: rawRank,
    qualitySignals: {
      hasTitle: Boolean(title),
      hasSnippet: snippet.length > 40,
      hasDate: Boolean(item.publishedAt || item.published_at || item.date || item.age),
      providerRank: rawRank
    }
  };
}

class BraveSearchProvider {
  constructor({ apiKey, fetchImpl } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.name = 'Brave Search';
  }

  isAvailable() { return Boolean(this.apiKey); }

  async search(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(options.maxResults || 10, 20)),
      text_decorations: 'false'
    });
    if (options.freshnessRequired) params.set('freshness', 'pw');
    const data = await requestJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      fetchImpl: this.fetchImpl,
      headers: { 'X-Subscription-Token': this.apiKey }
    });
    return (data?.web?.results || [])
      .map((item, index) => normalizeResult({
        ...item,
        publishedAt: item.age || item.page_age || item.publishedAt
      }, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}

class TavilySearchProvider {
  constructor({ apiKey, fetchImpl } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.name = 'Tavily Search';
  }

  isAvailable() { return Boolean(this.apiKey); }

  async search(query, options = {}) {
    const data = await requestJson('https://api.tavily.com/search', {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        topic: options.freshnessRequired ? 'news' : 'general',
        search_depth: options.researchMode ? 'advanced' : 'basic',
        max_results: Math.min(options.maxResults || 10, 20),
        include_answer: false,
        include_raw_content: false,
        include_domains: options.allowedDomains || [],
        exclude_domains: options.blockedDomains || []
      })
    });
    return (data?.results || [])
      .map((item, index) => normalizeResult({
        ...item,
        publishedAt: item.published_date || item.publishedAt
      }, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}

class DuckDuckGoProvider {
  constructor({ fetchImpl } = {}) {
    this.fetchImpl = fetchImpl;
    this.name = 'DuckDuckGo';
  }

  isAvailable() { return true; }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;

    // --- Strategy 1: Scrape the DDG HTML search page for real results ---
    try {
      const htmlResults = await this._scrapeHtmlResults(query, maxResults, options);
      if (htmlResults.length > 0) return htmlResults;
    } catch {
      // Fall through to Instant Answer fallback
    }

    // --- Strategy 2: Instant Answer API fallback (Wikipedia-style) ---
    try {
      return await this._instantAnswerFallback(query, maxResults, options);
    } catch {
      return [];
    }
  }

  async _scrapeHtmlResults(query, maxResults, options) {
    const fetchImpl = this.fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetchImpl('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        signal: controller.signal,
        redirect: 'follow'
      });
      if (!response.ok) return [];
      const html = await response.text();
      return this._parseHtmlResults(html, maxResults, options);
    } finally {
      clearTimeout(timer);
    }
  }

  _parseHtmlResults(html, maxResults, options) {
    const items = [];
    // DuckDuckGo Lite uses a table structure where each result is spread across 3-4 <tr> elements.
    // The easiest way to parse is to split by `<td valign="top">` which marks the start of each result numbering.
    const resultBlocks = html.split('<td valign="top">').slice(1);
    
    for (const block of resultBlocks) {
      if (items.length >= maxResults) break;
      
      // Extract URL and Title from the first link in the block: <a rel="nofollow" href="...uddg=URL...">Title</a>
      const urlMatch = block.match(/href="([^"]+)"/i);
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      // Extract snippet from <td class='result-snippet'>...</td>
      const snippetMatch = block.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i);

      let rawUrl = urlMatch ? urlMatch[1].trim() : '';
      if (rawUrl.includes('uddg=')) {
        try {
          const parsed = new URL(rawUrl, 'https://duckduckgo.com');
          rawUrl = decodeURIComponent(parsed.searchParams.get('uddg') || rawUrl);
        } catch { /* keep rawUrl as-is */ }
      }

      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").trim()
        : '';
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
        : '';

      if (rawUrl && (title || snippet) && /^https?:\/\//i.test(rawUrl)) {
        items.push(normalizeResult({
          title: title || rawUrl,
          url: rawUrl,
          snippet,
          sourceName: this.name
        }, items.length, this.name));
      }
    }
    return items.filter((item) => hostnameAllowed(item.url, options));
  }

  async _instantAnswerFallback(query, maxResults, options) {
    const data = await requestJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { fetchImpl: this.fetchImpl }
    );
    const items = [];
    if (data?.AbstractText && data?.AbstractURL) {
      items.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
        sourceName: data.AbstractSource || this.name
      });
    }
    const collect = (topics = []) => {
      for (const topic of topics) {
        if (topic?.Topics) collect(topic.Topics);
        if (topic?.Text && topic?.FirstURL) {
          items.push({
            title: topic.Text.split(' - ')[0],
            url: topic.FirstURL,
            snippet: topic.Text,
            sourceName: this.name
          });
        }
      }
    };
    collect(data?.RelatedTopics || []);
    return items
      .slice(0, maxResults)
      .map((item, index) => normalizeResult(item, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}


class WikipediaProvider {
  constructor({ fetchImpl } = {}) {
    this.fetchImpl = fetchImpl;
    this.name = 'Wikipedia OpenSearch';
  }

  isAvailable() { return true; }

  async search(query, options = {}) {
    if (options.officialOnly) return [];
    const data = await requestJson(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${Math.min(options.maxResults || 10, 10)}&namespace=0&format=json&origin=*`,
      { fetchImpl: this.fetchImpl }
    );
    const titles = data?.[1] || [];
    return titles.map((title, index) => normalizeResult({
      title,
      snippet: data?.[2]?.[index],
      url: data?.[3]?.[index],
      sourceName: this.name
    }, index, this.name)).filter((item) => hostnameAllowed(item.url, options));
  }
}

class CompositeSearchProvider {
  constructor(providers = []) {
    this.providers = providers.filter((provider) => provider?.isAvailable?.());
    this.name = 'Composite Search';
  }

  isAvailable() { return this.providers.length > 0; }

  async search(query, options = {}) {
    const settled = await Promise.allSettled(
      this.providers.map((provider) => provider.search(query, options))
    );
    const results = [];
    const errors = [];
    settled.forEach((item, index) => {
      if (item.status === 'fulfilled') results.push(...item.value);
      else errors.push({ provider: this.providers[index].name, error: item.reason?.message || String(item.reason) });
    });
    return { results, errors, providersTried: this.providers.map((provider) => provider.name) };
  }
}

function createSearchProvider(cfg = {}, options = {}) {
  const search = cfg.providers?.search || cfg.search || {};
  const providers = [
    new BraveSearchProvider({ apiKey: process.env.BRAVE_SEARCH_API_KEY || search.braveApiKey || cfg.providers?.brave?.apiKey, fetchImpl: options.fetchImpl }),
    new TavilySearchProvider({ apiKey: process.env.TAVILY_API_KEY || search.tavilyApiKey || cfg.providers?.tavily?.apiKey, fetchImpl: options.fetchImpl })
  ];
  if (search.allowPublicFallbacks !== false) {
    providers.push(new DuckDuckGoProvider({ fetchImpl: options.fetchImpl }));
    providers.push(new WikipediaProvider({ fetchImpl: options.fetchImpl }));
  }
  return new CompositeSearchProvider(providers);
}

module.exports = {
  BraveSearchProvider,
  TavilySearchProvider,
  DuckDuckGoProvider,
  WikipediaProvider,
  CompositeSearchProvider,
  createSearchProvider,
  normalizeResult,
  hostnameAllowed,
  getDomain,
  requestJson
};
