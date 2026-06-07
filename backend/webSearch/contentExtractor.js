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

function cleanText(input = '') {
  return decodeEntities(input)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?:subscribe to our newsletter|advertisement|accept all cookies)/gi, ' ')
    .trim();
}

function extractMainContent(page) {
  if (!page?.html) return page;
  const html = String(page.html);
  const title = extractMeta(html, 'og:title')
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || page.title
    || page.finalUrl;
  const publishedAt = page.publishedAt
    || extractMeta(html, 'article:published_time')
    || extractMeta(html, 'datePublished')
    || null;
  const safeHtml = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|form|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+(?:hidden|aria-hidden=["']true["']|style=["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
  const article = safeHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || safeHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || safeHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || safeHtml;
  const text = cleanText(
    article
      .replace(/<(h[1-6]|p|li|blockquote|pre|br|tr|section|div)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  return {
    ...page,
    title: cleanText(title),
    text,
    publishedAt,
    html: undefined
  };
}

function detectSuspiciousInstructions(text = '') {
  const patterns = [
    /ignore (?:all |the )?(?:previous|system) instructions/i,
    /reveal (?:the )?(?:system prompt|api key|secret|password)/i,
    /call (?:a |the )?tool/i,
    /delete (?:the )?(?:database|files|account)/i
  ];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

module.exports = {
  extractMainContent,
  cleanText,
  decodeEntities,
  extractMeta,
  detectSuspiciousInstructions
};
