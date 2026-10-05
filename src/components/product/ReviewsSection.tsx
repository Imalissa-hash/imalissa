"use client";

import { useEffect, useState } from "react";
import { Star, PenLine, BadgeCheck, ChevronDown } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useStore } from "@/components/providers/AppProviders";

interface ReviewItem {
  id: string;
  name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface ReviewStats {
  average: number;
  count: number;
}

/**
 * Reviews list + write-review form (verified buyers only).
 */
export function ReviewsSection({ productId }: { productId: string }) {
  const { user, toast } = useStore();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverStar, setHoverStar] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/reviews?productId=${productId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setReviews(json.data.items);
        setStats(json.data.stats);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, title, comment }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubmitted(true);
        setFormOpen(false);
        toast("Review submitted — it will appear after moderation", "success");
      } else {
        toast(json.message ?? "Could not submit review", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <section id="reviews" className="scroll-mt-32">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold text-mist-50">
          Customer Reviews{" "}
          <span className="text-gold-500">({stats.count})</span>
        </h2>
        <button
          onClick={() => setFormOpen((v) => !v)}
          disabled={submitted}
          className="btn-outline-gold flex items-center gap-2 rounded-xl px-5 py-2.5 text-[0.84rem] disabled:opacity-50"
        >
          <PenLine size={15} />
          {submitted ? "Review submitted" : "Write a review"}
        </button>
      </div>

      {/* Write form */}
      {formOpen && (
        <form onSubmit={submit} className="mb-8 rounded-2xl border border-gold-500/25 bg-gold-500/[0.04] p-5 sm:p-6">
          {!user && (
            <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-[0.82rem] text-warning">
              Please <a href="/auth/login" className="underline">log in</a> to write a review.
            </p>
          )}
          <p className="mb-3 text-[0.84rem] font-semibold text-mist-200">Your rating</p>
          <div className="mb-4 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRating(s)}
                onMouseEnter={() => setHoverStar(s)}
                onMouseLeave={() => setHoverStar(0)}
                aria-label={`${s} stars`}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={26}
                  className={cn(
                    (hoverStar || rating) >= s ? "text-gold-500" : "text-mist-700"
                  )}
                  fill={(hoverStar || rating) >= s ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Review title (optional)"
            className="input-premium mb-3"
            maxLength={100}
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience with this product…"
            className="input-premium min-h-28 resize-y"
            required
            minLength={5}
            maxLength={1000}
          />
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={!user || submitting} className="btn-gold rounded-xl px-6 py-2.5 text-sm disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit review"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-white/10 px-6 py-2.5 text-sm text-mist-400 transition hover:text-mist-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Summary */}
      {stats.count > 0 && (
        <div className="mb-8 grid gap-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-5xl font-bold text-gold-gradient">
              {stats.average.toFixed(1)}
            </span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={15}
                  className={Math.round(stats.average) >= s ? "text-gold-500" : "text-mist-700"}
                  fill={Math.round(stats.average) >= s ? "currentColor" : "none"}
                />
              ))}
            </div>
            <span className="text-[0.72rem] text-mist-500">{stats.count} reviews</span>
          </div>
          <div className="space-y-1.5">
            {distribution.map((d) => (
              <div key={d.star} className="flex items-center gap-3 text-[0.76rem]">
                <span className="w-8 text-mist-400">{d.star}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-mist-500">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-mist-500">
          No reviews yet. Be the first to review this product!
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={13}
                      className={r.rating >= s ? "text-gold-500" : "text-mist-700"}
                      fill={r.rating >= s ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                {r.isVerified && (
                  <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[0.66rem] font-semibold text-success">
                    <BadgeCheck size={11} /> Verified Purchase
                  </span>
                )}
                <span className="ml-auto text-[0.7rem] text-mist-600">
                  {formatDate(r.createdAt, "short")}
                </span>
              </div>
              {r.title && <p className="mt-2.5 font-semibold text-mist-100">{r.title}</p>}
              {r.comment && <p className="mt-1 text-[0.88rem] leading-relaxed text-mist-300">{r.comment}</p>}
              <p className="mt-2 text-[0.74rem] text-mist-500">— {r.name}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
