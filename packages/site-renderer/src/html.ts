/**
 * HTML serialisation helpers.
 *
 * `renderToStaticMarkup` already escapes every text node and every attribute
 * value React produces, but the document shell (`<head>`, meta tags, the inline
 * progressive-enhancement script) is assembled as a string. Anything that
 * originates from the site document - which, in the general case, was generated
 * from a business description - has to be escaped here.
 */

/** Escapes text for use in element content or in a quoted attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * JSON for embedding in a `<script>` block.
 *
 * `</script>` and `<!--` are what actually terminate/short-circuit a script
 * element, so those are the characters that matter most. Escaping `<`, `>` and
 * `&` to unicode also keeps the payload inert wherever else it is inlined.
 * U+2028/U+2029 are escaped because they terminate a line in older JS parsers.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Only http(s) URLs may be referenced from `<link>`, `<script>` or `<iframe>`. */
export function safeExternalUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

/**
 * A root-relative URL, for `<link rel=canonical>` and Open Graph tags. Only
 * paths starting with a single `/` are allowed, so an AI-authored value cannot
 * turn the canonical URL into a claim that the site lives on another domain.
 */
export function safeRelativeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
}
