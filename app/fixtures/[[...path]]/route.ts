import { fixtureBody } from "@/lib/fixtures/sites"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params
  const hit = fixtureBody(`/fixtures/${path.join("/")}`)
  if (!hit) return new Response("Not found", { status: 404 })
  const body = typeof hit.body === "string" ? hit.body : new Uint8Array(hit.body)
  return new Response(body, { headers: { "content-type": hit.contentType } })
}
