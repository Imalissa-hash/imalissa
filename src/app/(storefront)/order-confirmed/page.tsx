import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderConfirmed } from "@/components/checkout/OrderConfirmed";

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false },
};

export default function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; sync?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <OrderConfirmedWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderConfirmedWrapper({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; sync?: string }>;
}) {
  const sp = await searchParams;
  return <OrderConfirmed orderNumber={sp.order ?? ""} syncStatus={sp.sync ?? ""} />;
}
