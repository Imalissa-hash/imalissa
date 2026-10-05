"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquareText, Star, Trash2 } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { AccountPanel } from "@/components/account/AccountShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";

interface MyReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isVerified: boolean;
  createdAt: string;
}

export function ReviewsClient() {
  const { toast } = useStore();
  const [reviews, setReviews] = useState<MyReview[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/account/reviews");
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) setReviews(json.data as MyReview[]);
      else if (res.status === 401) setReviews([]);
      else setReviews([]);
    })();
  }, []);

  const remove = async (id: string) => {
    const res = await fetch(`/api/account/reviews?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) {
      setReviews((list) => (list ? list.filter((r) => r.id !== id) : list));
      toast("Review removed", "info");
    } else {
      toast(json.message ?? "Could not remove review", "error");
    }
  };

  if (reviews === null) {
    return (
      <AccountPanel title="My Reviews">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      </AccountPanel>
    );
  }

  return (
    <AccountPanel
      title="My Reviews"
      subtitle="Reviews appear publicly after a quick moderation check"
    >
      {reviews.length === 0 ? (
        <EmptyState
          title="You haven't reviewed anything yet"
          description="Bought something recently? Share your experience and help other shoppers."
          actionLabel="View your orders"
          actionHref="/account/orders"
          icon={<MessageSquareText size={26} />}
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="flex gap-4 rounded-xl border border-white/[0.07] bg-ink-900/60 p-4"
            >
              <Link
                href={`/product/${r.productSlug}`}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800"
              >
                {r.productImage &&
                  (r.productImage.endsWith(".svg") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.productImage}
                      alt={r.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Image
                      src={r.productImage}
                      alt={r.productName}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ))}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/product/${r.productSlug}`}
                    className="line-clamp-1 text-[0.92rem] font-medium text-mist-100 transition hover:text-gold-300"
                  >
                    {r.productName}
                  </Link>
                  <StatusBadge status={r.status} />
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={13}
                        className={s <= r.rating ? "text-gold-400" : "text-mist-700"}
                        fill={s <= r.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                  <span className="text-[0.74rem] text-mist-600">
                    {formatDate(r.createdAt, "short")}
                  </span>
                  {r.isVerified && (
                    <span className="rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[0.64rem] font-bold uppercase text-success">
                      Verified
                    </span>
                  )}
                </div>

                {r.title && <p className="mt-1.5 text-[0.86rem] font-semibold text-mist-200">{r.title}</p>}
                {r.comment && (
                  <p className="mt-0.5 line-clamp-3 text-[0.84rem] leading-relaxed text-mist-400">
                    {r.comment}
                  </p>
                )}

                <button
                  onClick={() => remove(r.id)}
                  className="mt-2 flex items-center gap-1.5 text-[0.76rem] text-mist-500 transition hover:text-danger"
                >
                  <Trash2 size={12} /> Delete review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AccountPanel>
  );
}
