export function requestOrigin(request: Request): string {
  const configured = process.env.PREP_PUBLIC_URL?.trim().replace(/\/$/, "")
  if (configured && /^https?:\/\//i.test(configured)) return configured
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host")?.trim()
  if (!host) return new URL(request.url).origin
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https")
  return `${proto}://${host}`
}
