/**
 * Strip Markdown, images, embeds (:::frame, :::carousel, :::button), HTML, and URLs to clean plain text.
 * Ideal for post previews, cards, and subtitle descriptions.
 */
export function cleanArticleExcerpt(text: string, maxLength = 200): string {
  if (!text) return "";
  let s = text;

  // 1. Remove custom blocks completely
  s = s.replace(/:::(?:carousel|frame|button)[\s\S]*?:::/gi, " ");
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");

  // 2. Remove standard markdown images ![alt](url)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");

  // 3. Remove malformed images like !Nakvalnia2https://... or !alt(url) or ![alt]
  s = s.replace(/![^\s]*https?:\/\/[^\s]+/gi, " ");
  s = s.replace(/!\[[^\]]*\]/g, " ");

  // 4. Remove standalone URLs (http:// or https://)
  s = s.replace(/https?:\/\/[^\s)]+/gi, " ");

  // 5. Replace links [text](url) with just the text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // 6. Remove markdown tables
  s = s.replace(/^\s*\|.*?\|\s*$/gm, " ");
  s = s.replace(/\|/g, " ");

  // 7. Remove headers, quotes, lists, code blocks
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, " ");
  s = s.replace(/^>\s?/gm, " ");
  s = s.replace(/^\s*[-+*]\s+/gm, " ");
  s = s.replace(/^\s*\d+\.\s+/gm, " ");

  // 8. Remove formatting markers (*, _, ~, #)
  s = s.replace(/[*_~#]/g, "");

  // 9. Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  // 10. Truncate cleanly at word boundary
  if (s.length > maxLength) {
    const truncated = s.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated).trimEnd() + "…";
  }
  return s;
}

export function mdToPlain(md: string): string {
  return cleanArticleExcerpt(md, 5000);
}

export function mdExcerpt(md: string, n = 100): string {
  return cleanArticleExcerpt(md, n);
}
