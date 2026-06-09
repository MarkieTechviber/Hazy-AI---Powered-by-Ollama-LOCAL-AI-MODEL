'use strict';

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i')
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || null;
}

function extractLink(html, rel) {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]+href=["']([^"']+)["']`, 'i'),
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${escaped}[^"']*["']`, 'i')
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || null;
}

function cleanText(input = '') {
  return decodeEntities(input)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?:subscribe to our newsletter|advertisement|accept all cookies|manage cookies|cookie preferences|share this article)/gi, ' ')
    .trim();
}

function stripUnwantedHtml(html = '') {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|form|nav|footer|header|aside|button)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+(?:hidden|aria-hidden=["']true["']|style=["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
    .replace(/<div[^>]+(?:class|id)=["'][^"']*(cookie|newsletter|subscribe|advert|promo|modal|share|social)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ');
}

function detectSuspiciousInstructions(text = '') {
  const patterns = [
    /ignore (?:all |the )?(?:previous|system|developer) instructions/i,
    /override (?:the )?(?:system|developer|user) prompt/i,
    /reveal (?:the )?(?:system prompt|api key|secret|password|token)/i,
    /send (?:the )?(?:secrets?|api keys?|tokens?|passwords?)/i,
    /run (?:this|the following) command/i,
    /call (?:a |the )?tool/i,
    /delete (?:the )?(?:database|files|account)/i,
    /you are now (?:admin|root|developer|system)/i
  ];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function extractMainContent(page) {
  if (!page?.html) return page;
  const html = String(page.html);
  const title = extractMeta(html, 'og:title')
    || extractMeta(html, 'twitter:title')
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || page.title
    || page.finalUrl;
  const description = extractMeta(html, 'description')
    || extractMeta(html, 'og:description')
    || extractMeta(html, 'twitter:description')
    || null;
  const publishedAt = page.publishedAt
    || extractMeta(html, 'article:published_time')
    || extractMeta(html, 'datePublished')
    || extractMeta(html, 'date')
    || extractMeta(html, 'pubdate')
    || null;
  const author = extractMeta(html, 'author')
    || extractMeta(html, 'article:author')
    || null;
  const canonicalRaw = extractLink(html, 'canonical');
  let canonicalUrl = null;
  try { canonicalUrl = canonicalRaw ? new URL(canonicalRaw, page.finalUrl || page.url).toString() : null; } catch {}

  const safeHtml = stripUnwantedHtml(html);
  const article = safeHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || safeHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || safeHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || safeHtml;
  const text = cleanText(
    article
      .replace(/<(h[1-6]|p|li|blockquote|pre|br|tr|section|div|td|th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  const promptInjectionPatterns = detectSuspiciousInstructions(text);
  return {
    ...page,
    title: cleanText(title),
    description: description ? cleanText(description) : null,
    author: author ? cleanText(author) : null,
    canonicalUrl,
    text,
    publishedAt,
    promptInjectionPatterns,
    untrustedInstructions: promptInjectionPatterns.length > 0,
    html: undefined
  };
}

module.exports = {
  extractMainContent,
  cleanText,
  decodeEntities,
  extractMeta,
  extractLink,
  stripUnwantedHtml,
  detectSuspiciousInstructions
};
