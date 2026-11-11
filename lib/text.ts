export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeBasicEntities(stripped)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function charLength(value: string): number {
  return Array.from(value).length
}

export function clipChars(value: string, max: number): { text: string; clipped: boolean } {
  const chars = Array.from(value)
  if (chars.length <= max) return { text: value, clipped: false }
  return { text: chars.slice(0, max).join(""), clipped: true }
}

const PLACEHOLDERS = new Set([
  "null",
  "undefined",
  "unknown",
  "n/a",
  "na",
  "n.a",
  "none",
  "nil",
  "-",
  "--",
  "tbd",
])

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(value.trim().toLowerCase())
}

export function scriptKind(value: string): "cjk" | "latin" | "mixed" | "empty" {
  const cjk = (value.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (value.match(/[A-Za-z]/g) ?? []).length
  if (cjk === 0 && latin === 0) return "empty"
  if (cjk > 0 && latin > 0) return "mixed"
  return cjk > 0 ? "cjk" : "latin"
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
