import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export class UrlError extends Error {
  code: "invalid" | "protocol" | "credentials" | "blocked"

  constructor(code: UrlError["code"]) {
    super(code)
    this.code = code
  }
}

function ipv4Blocked(host: string, allowLoopback: boolean): boolean {
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 10 || a === 0) return true
  if (a === 127) return !allowLoopback
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function ipBlocked(address: string, allowLoopback: boolean): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return !allowLoopback
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Blocked(mapped[1], allowLoopback)
  if (isIP(host) === 4) return ipv4Blocked(host, allowLoopback)
  return false
}

export async function assertPublicUrl(
  raw: string,
  options?: { allowLoopback?: boolean },
): Promise<URL> {
  const allowLoopback = options?.allowLoopback !== false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UrlError("invalid")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UrlError("protocol")
  if (url.username || url.password) throw new UrlError("credentials")
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host) throw new UrlError("invalid")
  if (host === "metadata.google.internal" || host.endsWith(".localhost")) {
    throw new UrlError("blocked")
  }
  if (host === "localhost") {
    if (!allowLoopback) throw new UrlError("blocked")
    return url
  }
  if (isIP(host)) {
    if (ipBlocked(host, allowLoopback)) throw new UrlError("blocked")
    return url
  }
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new UrlError("invalid")
  }
  if (records.length === 0) throw new UrlError("invalid")
  for (const record of records) {
    if (ipBlocked(record.address, allowLoopback)) throw new UrlError("blocked")
  }
  return url
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ""
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid"]) {
      url.searchParams.delete(key)
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    url.pathname = url.pathname.replace(/\/+$/, "") || "/"
    const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    url.search = ""
    for (const [key, value] of entries) url.searchParams.append(key, value)
    return url.toString()
  } catch {
    return raw.trim()
  }
}

export function toAbsoluteUrl(href: string, base: string): string | null {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return null
  }
  const candidate = href.startsWith("//") ? `https:${href}` : href
  try {
    const url = new URL(candidate, base)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

export function sameSite(a: string, b: string): boolean {
  try {
    const left = new URL(a).hostname.toLowerCase().replace(/^www\./, "")
    const right = new URL(b).hostname.toLowerCase().replace(/^www\./, "")
    return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  } catch {
    return false
  }
}

export function hostsConflict(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/^www\./, "")
  const right = b.toLowerCase().replace(/^www\./, "")
  if (!left || !right || left === right) return false
  if (left.endsWith(`.${right}`) || right.endsWith(`.${left}`)) return false
  return true
}
