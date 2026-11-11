import { DeliveryPanel } from "@/components/delivery-panel"

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeliveryPanel id={id} />
}