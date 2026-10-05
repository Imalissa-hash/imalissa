import type { Metadata } from "next";
import { CartPageClient } from "@/components/cart/CartPageClient";

export const metadata: Metadata = {
  title: "Shopping Cart",
  description: "Review the items in your Imalissa shopping cart.",
  robots: { index: false },
};

export default function CartPage() {
  return <CartPageClient />;
}
