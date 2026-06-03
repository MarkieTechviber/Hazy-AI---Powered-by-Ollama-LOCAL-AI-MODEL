'use strict';

/**
 * Backend web search tool for Hazy Agent Mode.
 *
 * This is intentionally backend-side instead of browser-side so normal chat can
 * receive real tool context before the model answers. It uses a real provider
 * when configured (Brave Search), then graceful public fallbacks for music and
 * encyclopedia-style lookups.
 */

const DEFAULT_TIMEOUT_MS = 9000;

function compactText(value, max = 420) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function uniqueKey(value) {
  return String(value || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function addResult(results, result) {
  const title = compactText(result.title || result.name || '', 160);
  const url = compactText(result.url || result.link || '', 500);
  const snippet = compactText(result.snippet || result.description || result.text || '', 520);
  const source = compactText(result.source || result.provider || 'web', 80);

  if (!title && !snippet) return;
  const key = uniqueKey(url || `${source}:${title}:${snippet.slice(0, 80)}`);
  if (results.some((item) => item._key === key)) return;

  results.push({
    title: title || source,
    url,
    snippet,
    source,
    _key: key
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HazyAI/1.0 (+local educational assistant)',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!response.ok) {
      const message = json?.message || json?.error || text.slice(0, 180) || response.statusText;
      throw new Error(`${response.status} ${message}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function getBraveKey(cfg = {}) {
  return process.env.BRAVE_SEARCH_API_KEY
    || cfg.providers?.search?.braveApiKey
    || cfg.providers?.braveSearch?.apiKey
    || cfg.providers?.brave?.apiKey
    || '';
}

function isLikelyMusicQuery(query) {
  return /\b(song|artist|album|lyrics|track|music|singer|band|spotify|youtube music|soundcloud|mirai-e|mirai e)\b/i.test(query)
    || /["“”].+["“”]/.test(query);
}

async function braveSearch(query, cfg, limit) {
  const apiKey = getBraveKey(cfg);
  if (!apiKey) return [];

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 10)}&text_decorations=false`;
  const data = await fetchJson(url, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json'
    }
  });

  const results = [];
  for (const item of data?.web?.results || []) {
    addResult(results, {
      title: item.title,
      url: item.url,
      snippet: item.description,
      source: 'Brave Search'
    });
  }
  return results;
}

async function duckDuckGoInstant(query, limit) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJson(url);
  const results = [];

  if (data?.AbstractText) {
    addResult(results, {
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText,
      source: 'DuckDuckGo Instant Answer'
    });
  }

  const topics = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of topics) {
    if (results.length >= limit) break;
    if (topic?.Text) {
      addResult(results, {
        title: topic.FirstURL ? topic.FirstURL.split('/').pop()?.replace(/_/g, ' ') : topic.Text.slice(0, 80),
        url: topic.FirstURL,
        snippet: topic.Text,
        source: 'DuckDuckGo Related Topic'
      });
    }
    for (const nested of topic?.Topics || []) {
      if (results.length >= limit) break;
      if (nested?.Text) {
        addResult(results, {
          title: nested.FirstURL ? nested.FirstURL.split('/').pop()?.replace(/_/g, ' ') : nested.Text.slice(0, 80),
          url: nested.FirstURL,
          snippet: nested.Text,
          source: 'DuckDuckGo Related Topic'
        });
      }
    }
  }

  return results;
}

async function wikipediaOpenSearch(query, limit) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${Math.min(limit, 8)}&namespace=0&format=json&origin=*`;
  const data = await fetchJson(url);
  const results = [];

  const titles = data?.[1] || [];
  const snippets = data?.[2] || [];
  const urls = data?.[3] || [];
  for (let i = 0; i < titles.length; i += 1) {
    addResult(results, {
      title: titles[i],
      url: urls[i],
      snippet: snippets[i],
      source: 'Wikipedia'
    });
  }

  return results;
}

async function iTunesSearch(query, limit) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${Math.min(limit, 10)}`;
  const data = await fetchJson(url);
  const results = [];

  for (const item of data?.results || []) {
    const title = [item.trackName, item.artistName].filter(Boolean).join(' — ');
    const date = item.releaseDate ? `Released ${String(item.releaseDate).slice(0, 10)}. ` : '';
    const album = item.collectionName ? `Album: ${item.collectionName}. ` : '';
    const genre = item.primaryGenreName ? `Genre: ${item.primaryGenreName}. ` : '';
    addResult(results, {
      title,
      url: item.trackViewUrl || item.collectionViewUrl || item.artistViewUrl,
      snippet: `${date}${album}${genre}`.trim(),
      source: 'Apple iTunes Search'
    });
  }

  return results;
}

async function musicBrainzSearch(query, limit) {
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=${Math.min(limit, 8)}`;
  const data = await fetchJson(url, { timeoutMs: 10000 });
  const results = [];

  for (const item of data?.recordings || []) {
    const artist = (item['artist-credit'] || []).map((credit) => credit.name).filter(Boolean).join(', ');
    const firstRelease = item['first-release-date'] ? `First release: ${item['first-release-date']}. ` : '';
    const releases = (item.releases || []).slice(0, 2).map((rel) => rel.title).filter(Boolean);
    addResult(results, {
      title: [item.title, artist].filter(Boolean).join(' — '),
      url: item.id ? `https://musicbrainz.org/recording/${item.id}` : '',
      snippet: `${firstRelease}${releases.length ? `Releases: ${releases.join(', ')}.` : ''}`.trim(),
      source: 'MusicBrainz'
    });
  }

  return results;
}

async function webSearch({ query, cfg = {}, limit = 8 } = {}) {
  const cleanQuery = compactText(query, 300);
  if (!cleanQuery) {
    return {
      success: false,
      query: cleanQuery,
      results: [],
      providersTried: [],
      error: 'Missing search query.'
    };
  }

  const results = [];
  const providersTried = [];
  const errors = [];

  async function tryProvider(name, fn) {
    providersTried.push(name);
    try {
      const providerResults = await fn();
      for (const item of providerResults || []) addResult(results, item);
    } catch (error) {
      errors.push({ provider: name, error: error.message });
    }
  }

  await tryProvider('Brave Search', () => braveSearch(cleanQuery, cfg, limit));

  if (isLikelyMusicQuery(cleanQuery)) {
    await tryProvider('Apple iTunes Search', () => iTunesSearch(cleanQuery, limit));
    await tryProvider('MusicBrainz', () => musicBrainzSearch(cleanQuery, limit));
  }

  if (results.length < 3) {
    await tryProvider('DuckDuckGo Instant Answer', () => duckDuckGoInstant(cleanQuery, limit));
  }

  if (results.length < 3) {
    await tryProvider('Wikipedia OpenSearch', () => wikipediaOpenSearch(cleanQuery, limit));
  }

  const cleanResults = results.slice(0, limit).map(({ _key, ...item }) => item);

  return {
    success: cleanResults.length > 0,
    query: cleanQuery,
    results: cleanResults,
    providersTried,
    errors,
    note: cleanResults.length
      ? 'Search results gathered before model generation.'
      : 'No useful search result was returned by the configured providers.'
  };
}

module.exports = {
  webSearch,
  isLikelyMusicQuery,
  compactText
};
