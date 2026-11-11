import { CheckoutPanel } from "@/components/checkout-panel"

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CheckoutPanel id={id} />
}
