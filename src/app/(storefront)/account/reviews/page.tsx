import type { Metadata } from "next";
import { ReviewsClient } from "@/components/account/ReviewsClient";

export const metadata: Metadata = {
  title: "My Reviews",
  robots: { index: false },
};

export default function MyReviewsPage() {
  return <ReviewsClient />;
}
