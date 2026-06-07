'use strict';

const DEFAULT_TIMEOUT_MS = 9000;

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'HazyResearch/1.0',
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

function hostnameAllowed(url, options = {}) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const allowed = options.allowedDomains || [];
    const blocked = options.blockedDomains || [];
    if (allowed.length && !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    if (blocked.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeResult(item, index, providerName) {
  return {
    title: String(item.title || item.name || '').trim().slice(0, 240),
    url: String(item.url || item.link || '').trim().slice(0, 1200),
    snippet: String(item.snippet || item.description || item.content || item.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
    sourceName: String(item.sourceName || item.source || providerName || '').trim().slice(0, 120),
    publishedAt: item.publishedAt || item.published_at || item.age || null,
    rank: Number(item.rank || index + 1),
    provider: providerName
  };
}

class BraveSearchProvider {
  constructor({ apiKey, fetchImpl } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.name = 'Brave Search';
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

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
      .map((item, index) => normalizeResult(item, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}

class TavilySearchProvider {
  constructor({ apiKey, fetchImpl } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.name = 'Tavily Search';
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

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
        search_depth: 'basic',
        max_results: Math.min(options.maxResults || 10, 20),
        include_answer: false,
        include_raw_content: false,
        include_domains: options.allowedDomains || [],
        exclude_domains: options.blockedDomains || []
      })
    });
    return (data?.results || [])
      .map((item, index) => normalizeResult(item, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}

class DuckDuckGoProvider {
  constructor({ fetchImpl } = {}) {
    this.fetchImpl = fetchImpl;
    this.name = 'DuckDuckGo Instant Answer';
  }

  isAvailable() {
    return true;
  }

  async search(query, options = {}) {
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
      .slice(0, options.maxResults || 10)
      .map((item, index) => normalizeResult(item, index, this.name))
      .filter((item) => hostnameAllowed(item.url, options));
  }
}

class WikipediaProvider {
  constructor({ fetchImpl } = {}) {
    this.fetchImpl = fetchImpl;
    this.name = 'Wikipedia OpenSearch';
  }

  isAvailable() {
    return true;
  }

  async search(query, options = {}) {
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

  isAvailable() {
    return this.providers.length > 0;
  }

  async search(query, options = {}) {
    const settled = await Promise.allSettled(
      this.providers.map((provider) => provider.search(query, options))
    );
    const results = [];
    const errors = [];
    settled.forEach((item, index) => {
      if (item.status === 'fulfilled') results.push(...item.value);
      else errors.push({
        provider: this.providers[index].name,
        error: item.reason?.message || String(item.reason)
      });
    });
    return { results, errors, providersTried: this.providers.map((provider) => provider.name) };
  }
}

function createSearchProvider(cfg = {}, options = {}) {
  const search = cfg.providers?.search || cfg.search || {};
  const providers = [
    new BraveSearchProvider({
      apiKey: process.env.BRAVE_SEARCH_API_KEY || search.braveApiKey || cfg.providers?.brave?.apiKey,
      fetchImpl: options.fetchImpl
    }),
    new TavilySearchProvider({
      apiKey: process.env.TAVILY_API_KEY || search.tavilyApiKey || cfg.providers?.tavily?.apiKey,
      fetchImpl: options.fetchImpl
    })
  ];
  if (search.allowPublicFallbacks !== false) {
    providers.push(
      new DuckDuckGoProvider({ fetchImpl: options.fetchImpl }),
      new WikipediaProvider({ fetchImpl: options.fetchImpl })
    );
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
  requestJson
};
