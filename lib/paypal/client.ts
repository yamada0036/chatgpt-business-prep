import { paypalApiBase, paypalClientId, paypalClientSecret, paypalWebhookId } from "@/lib/site-mode"
import { centsToPayPalValue } from "@/lib/paypal/money"

export class PayPalError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = "PayPalError"
    this.status = status
  }
}

type Token = { value: string; expiresAt: number }

let fetchImpl: typeof fetch = globalThis.fetch
let tokenCache: Token | null = null

export function setPayPalFetchForTests(next: typeof fetch | null): void {
  fetchImpl = next ?? globalThis.fetch
  tokenCache = null
}

export function isPayPalCertUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return host === "paypal.com" || host.endsWith(".paypal.com")
}

async function paypalFetch(path: string, init: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set("authorization", `Bearer ${token}`)
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  return fetchImpl(`${paypalApiBase()}${path}`, { ...init, headers })
}

async function readError(response: Response): Promise<{ name: string; issues: string[] }> {
  try {
    const body = (await response.json()) as { name?: string; message?: string; details?: { issue?: string }[] }
    return {
      name: body.name || body.message || `PayPal HTTP ${response.status}`,
      issues: (body.details ?? []).map((detail) => detail.issue ?? "").filter(Boolean),
    }
  } catch {
    return { name: `PayPal HTTP ${response.status}`, issues: [] }
  }
}

async function accessToken(): Promise<string> {
  const id = paypalClientId()
  const secret = paypalClientSecret()
  if (!id || !secret) throw new PayPalError("PayPal credentials are not configured.", 503)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value
  const response = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  if (!response.ok) {
    const error = await readError(response)
    throw new PayPalError(`PayPal did not issue an access token (${error.name}).`, 502)
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new PayPalError("PayPal did not issue an access token.", 502)
  const expiresIn = Number(body.expires_in ?? 300)
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Math.max(30, expiresIn) * 1000 }
  return body.access_token
}

export type CreatedPayPalOrder = { id: string }

export async function createPayPalOrder(input: {
  auditId: string
  invoiceId: string
  currency: string
  amountCents: number
  returnUrl: string
  cancelUrl: string
}): Promise<CreatedPayPalOrder> {
  const token = await accessToken()
  const value = centsToPayPalValue(input.amountCents)
  const response = await paypalFetch(
    "/v2/checkout/orders",
    {
      method: "POST",
      headers: { "paypal-request-id": `prep-${input.auditId}-${input.invoiceId}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.auditId,
            invoice_id: input.invoiceId,
            description: "One-store ChatGPT business prep pack",
            amount: { currency_code: input.currency, value },
          },
        ],
        application_context: {
          brand_name: "ChatGPT business prep",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    },
    token,
  )
  if (!response.ok) {
    const error = await readError(response)
    throw new PayPalError(`PayPal did not create the order (${error.name}).`, 502)
  }
  const body = (await response.json()) as { id?: string }
  if (!body.id) throw new PayPalError("PayPal did not return an order id.", 502)
  return { id: body.id }
}

export type ObservedCapture = {
  orderId: string
  captureId: string | null
  status: string
  currency: string | null
  value: string | null
}

function captureFromOrder(orderId: string, body: unknown): ObservedCapture {
  const order = body as {
    id?: string
    status?: string
    purchase_units?: {
      payments?: {
        captures?: { id?: string; status?: string; amount?: { currency_code?: string; value?: string } }[]
      }
    }[]
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
  return {
    orderId: order.id || orderId,
    captureId: capture?.id ?? null,
    status: capture?.status || order.status || "",
    currency: capture?.amount?.currency_code ?? null,
    value: capture?.amount?.value ?? null,
  }
}

export async function capturePayPalOrder(orderId: string, requestId: string): Promise<ObservedCapture> {
  const token = await accessToken()
  const response = await paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        "paypal-request-id": requestId,
        prefer: "return=representation",
      },
      body: "{}",
    },
    token,
  )
  if (response.ok) return captureFromOrder(orderId, await response.json())
  const error = await readError(response)
  if (error.issues.includes("ORDER_ALREADY_CAPTURED")) {
    const existing = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, token)
    if (!existing.ok) throw new PayPalError("PayPal could not show the captured order.", 502)
    return captureFromOrder(orderId, await existing.json())
  }
  if (error.issues.includes("ORDER_NOT_APPROVED")) {
    throw new PayPalError("PayPal has not approved this order yet.", 409)
  }
  throw new PayPalError(`PayPal did not capture the order (${error.name}).`, 502)
}

export type PayPalSignatureHeaders = {
  authAlgo: string
  certUrl: string
  transmissionId: string
  transmissionSig: string
  transmissionTime: string
}

export function readPayPalSignatureHeaders(headers: Headers): PayPalSignatureHeaders | null {
  const authAlgo = headers.get("paypal-auth-algo")?.trim() ?? ""
  const certUrl = headers.get("paypal-cert-url")?.trim() ?? ""
  const transmissionId = headers.get("paypal-transmission-id")?.trim() ?? ""
  const transmissionSig = headers.get("paypal-transmission-sig")?.trim() ?? ""
  const transmissionTime = headers.get("paypal-transmission-time")?.trim() ?? ""
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return null
  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime }
}

export async function verifyPayPalWebhook(input: {
  headers: PayPalSignatureHeaders
  event: unknown
}): Promise<boolean> {
  const webhookId = paypalWebhookId()
  if (!webhookId) return false
  if (!isPayPalCertUrl(input.headers.certUrl)) return false
  const token = await accessToken()
  const response = await paypalFetch(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: input.headers.authAlgo,
        cert_url: input.headers.certUrl,
        transmission_id: input.headers.transmissionId,
        transmission_sig: input.headers.transmissionSig,
        transmission_time: input.headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: input.event,
      }),
    },
    token,
  )
  if (!response.ok) return false
  const body = (await response.json()) as { verification_status?: string }
  return body.verification_status === "SUCCESS"
}
