import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { TrackOrderClient } from "@/components/track/TrackOrderClient";

export const metadata: Metadata = {
  title: "Track Your Order",
  description: "Check the live status of your Imalissa order with your order number and phone/email.",
};

export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Track Order" }]} />
      <div className="mt-6">
        <Suspense
          fallback={<div className="skeleton mx-auto h-72 max-w-3xl rounded-3xl" />}
        >
          <TrackOrderClient />
        </Suspense>
      </div>
    </div>
  );
}
