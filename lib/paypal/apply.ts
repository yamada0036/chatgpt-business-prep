export type WebhookResult = { status: number; body: Record<string, unknown> }

export async function applyPayPalWebhook(input: { headers: Headers; rawBody: string }): Promise<WebhookResult> {
  void input.rawBody
  return { status: 200, body: { fulfilled: false, reason: "checkout_disabled" } }
}
