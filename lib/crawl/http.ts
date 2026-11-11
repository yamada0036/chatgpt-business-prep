import { UrlError, assertPublicUrl } from "@/lib/url-safety"

export type FetchFailure = "unreachable" | "login" | "timeout" | "blocked"

export type PublicFetch =
  | {
      ok: true
      url: string
      httpStatus: number
      contentType: string
      body: string
    }
  | {
      ok: false
      url: string
      httpStatus?: number
      reason: FetchFailure
    }

const USER_AGENT = "PrepAuditBot/0.1 (merchant-requested public page check)"

export async function fetchPublic(
  rawUrl: string,
  options: {
    timeoutMs: number
    maxBytes: number
    allowLoopback: boolean
    fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  },
): Promise<PublicFetch> {
  let current: URL
  try {
    current = await assertPublicUrl(rawUrl, { allowLoopback: options.allowLoopback })
  } catch (error) {
    const reason = error instanceof UrlError && error.code === "blocked" ? "blocked" : "unreachable"
    return { ok: false, url: rawUrl, reason }
  }
  const fetcher = options.fetchImpl ?? ((url: string, init: { signal: AbortSignal }) => fetch(url, init))
  for (let hop = 0; hop <= 3; hop += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const response = await fetcher(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/json;q=0.9,*/*;q=0.1",
        },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) return { ok: false, url: current.toString(), httpStatus: response.status, reason: "blocked" }
        try {
          current = await assertPublicUrl(new URL(location, current).toString(), {
            allowLoopback: options.allowLoopback,
          })
        } catch {
          return { ok: false, url: current.toString(), httpStatus: response.status, reason: "blocked" }
        }
        continue
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, url: current.toString(), httpStatus: response.status, reason: "login" }
      }
      if (!response.ok) {
        return { ok: false, url: current.toString(), httpStatus: response.status, reason: "unreachable" }
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > options.maxBytes) {
        return { ok: false, url: current.toString(), httpStatus: response.status, reason: "blocked" }
      }
      return {
        ok: true,
        url: current.toString(),
        httpStatus: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: buffer.toString("utf8"),
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError"
      return { ok: false, url: current.toString(), reason: aborted ? "timeout" : "unreachable" }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, url: current.toString(), reason: "blocked" }
}
