"use client"

import { useEffect, useRef } from "react"

type PayPalButtonsApi = {
  Buttons: (options: {
    createOrder: () => Promise<string>
    onApprove: (data: { orderID: string }) => Promise<void>
    onCancel?: () => void
    onError?: () => void
  }) => { render: (element: HTMLElement) => Promise<void>; close: () => void }
}

declare global {
  interface Window {
    paypal?: PayPalButtonsApi
  }
}

export function PayPalButtons({
  id,
  clientId,
  currency,
  email,
  amountCents,
  onAwaitingWebhook,
  onError,
}: {
  id: string
  clientId: string
  currency: string
  email: string
  amountCents: number
  onAwaitingWebhook: () => void
  onError: (message: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const emailRef = useRef(email)

  useEffect(() => {
    emailRef.current = email
  }, [email])

  useEffect(() => {
    const target = container.current
    if (!target || !clientId) return
    let cancelled = false
    let buttons: ReturnType<PayPalButtonsApi["Buttons"]> | null = null
    const script = document.createElement("script")
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&disable-funding=card`
    script.async = true
    script.onload = () => {
      if (cancelled || !window.paypal || !container.current) return
      buttons = window.paypal.Buttons({
        createOrder: async () => {
          const response = await fetch(`/api/audits/${id}/checkout/paypal`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contact_email: emailRef.current }),
          })
          const data = (await response.json()) as {
            paypalOrderId?: string
            amountCents?: number
            currency?: string
            error?: { message: string }
          }
          if (!response.ok || !data.paypalOrderId) {
            const message = data.error?.message ?? "PayPal did not open."
            onError(message)
            throw new Error(message)
          }
          if (data.amountCents !== amountCents || data.currency !== currency) {
            const message = "The PayPal amount did not match this page. Reload and try again."
            onError(message)
            throw new Error(message)
          }
          return data.paypalOrderId
        },
        onApprove: async (data) => {
          const response = await fetch(`/api/audits/${id}/checkout/capture`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paypal_order_id: data.orderID }),
          })
          const body = (await response.json()) as { paid?: boolean; error?: { message: string } }
          if (!response.ok) {
            onError(body.error?.message ?? "PayPal did not capture the payment.")
            return
          }
          if (body.paid) {
            onError("The pack cannot unlock from the PayPal return. Wait for payment confirmation.")
            return
          }
          onAwaitingWebhook()
        },
        onCancel: () => onError("PayPal checkout was canceled. Nothing was charged."),
        onError: () => onError("PayPal checkout did not open."),
      })
      void buttons.render(container.current)
    }
    script.onerror = () => onError("The PayPal script did not load.")
    document.body.appendChild(script)
    return () => {
      cancelled = true
      buttons?.close()
      script.remove()
    }
  }, [amountCents, clientId, currency, id, onAwaitingWebhook, onError])

  return <div ref={container} data-checkout="paypal" />
}
