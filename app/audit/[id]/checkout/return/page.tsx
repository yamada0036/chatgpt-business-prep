import { CheckoutReturn } from "@/components/checkout-return"

export default async function CheckoutReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CheckoutReturn id={id} />
}
