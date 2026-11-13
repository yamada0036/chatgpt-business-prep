import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { assertAuditId } from "@/lib/store/audits-id"

/** HttpOnly cookie that proves this browser created the audit. It is not an email verification. */
export function ownerCookieName(auditId: string): string {
  return `prep_owner_${assertAuditId(auditId)}`
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createOwnerToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashOwnerToken(token) }
}

export function ownerTokenMatches(storedHash: string | undefined, token: string | undefined): boolean {
  if (!storedHash || !token) return false
  const actual = Buffer.from(hashOwnerToken(token))
  const expected = Buffer.from(storedHash)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function readOwnerToken(request: Request, auditId: string): string | undefined {
  const header = request.headers.get("x-prep-owner-token")?.trim()
  if (header) return header
  const name = ownerCookieName(auditId)
  const cookie = request.headers.get("cookie") ?? ""
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function ownerCookieHeader(auditId: string, token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${ownerCookieName(auditId)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function requestIsHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (forwarded) return forwarded === "https"
  return new URL(request.url).protocol === "https:"
}
