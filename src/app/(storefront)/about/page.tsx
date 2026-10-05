import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Gem,
  HeartHandshake,
  PackageCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Imalissa is a premium multi-category online store in Bangladesh — authentic products, honest pricing and nationwide Cash on Delivery.",
};

const VALUES = [
  {
    icon: BadgeCheck,
    title: "Authenticity first",
    text: "Every product is sourced from verified suppliers — no counterfeits, no surprises.",
  },
  {
    icon: HeartHandshake,
    title: "Customer obsession",
    text: "Real humans on support, fair returns and honest answers — before and after the sale.",
  },
  {
    icon: Zap,
    title: "Fast & reliable",
    text: "Nationwide delivery with Cash on Delivery, and live tracking on every order.",
  },
  {
    icon: Gem,
    title: "Premium experience",
    text: "From browsing to unboxing, everything is designed to feel considered and quality.",
  },
];

export default async function AboutPage() {
  const [settings, productCount, categoryCount, reviewAgg] = await Promise.all([
    getSettings(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.category.count({ where: { isActive: true } }),
    prisma.review.aggregate({ where: { status: "APPROVED" }, _avg: { rating: true }, _count: true }),
  ]);

  const stats = [
    { icon: PackageCheck, value: `${productCount}+`, label: "Products" },
    { icon: Target, value: `${categoryCount}+`, label: "Categories" },
    { icon: Users, value: "Nationwide", label: "Delivery in Bangladesh" },
    {
      icon: Sparkles,
      value: reviewAgg._count > 0 ? `${(reviewAgg._avg.rating ?? 0).toFixed(1)}★` : "New",
      label: reviewAgg._count > 0 ? `${reviewAgg._count} customer reviews` : "Reviews coming in",
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "About Us" }]} />

      {/* Hero */}
      <Reveal>
        <div className="mt-4 overflow-hidden rounded-3xl border border-gold-500/20 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 p-8 sm:p-12">
          <div className="max-w-3xl">
            <p className="text-[0.76rem] font-bold uppercase tracking-[0.28em] text-gold-400">
              Our story
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-mist-50 sm:text-5xl">
              Shopping in Bangladesh,{" "}
              <span className="text-gold-gradient">elevated.</span>
            </h1>
            <p className="mt-5 text-[0.98rem] leading-relaxed text-mist-300">
              Imalissa was built for shoppers who want two things at once: the variety of a
              multi-category marketplace, and the trust of a premium boutique. We curate
              electronics, fashion, home and lifestyle products, verify their quality, and
              deliver them anywhere in the country — with Cash on Delivery, live order tracking
              and a fair return policy.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/search" className="btn-gold rounded-xl px-6 py-3 text-sm">
                Explore the catalog
              </Link>
              <Link href="/contact" className="btn-outline-gold rounded-xl px-6 py-3 text-sm">
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Stats */}
      <Reveal>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-center transition hover:border-gold-500/30"
            >
              <s.icon size={20} className="mx-auto text-gold-400" />
              <p className="mt-3 font-display text-2xl font-bold text-mist-50">{s.value}</p>
              <p className="text-[0.78rem] text-mist-500">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Values */}
      <Reveal>
        <section className="mt-14">
          <div className="mb-7 text-center">
            <h2 className="font-display text-3xl font-bold text-mist-50">
              What we <span className="text-gold-gradient">stand for</span>
            </h2>
            <p className="mt-2 text-sm text-mist-500">The principles behind every order we ship</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-ink-800 to-ink-900 p-6 transition hover:-translate-y-1 hover:border-gold-500/30"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
                  <v.icon size={19} />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-mist-100">{v.title}</h3>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-mist-400">{v.text}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Contact strip */}
      <Reveal>
        <section className="mt-14 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-mist-50">Questions? We&apos;re here.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-mist-400">
            Reach our support team at <strong className="text-gold-300">{settings.contact.phone}</strong>{" "}
            or <strong className="text-gold-300">{settings.contact.email}</strong> —{" "}
            {settings.contact.hours}.
          </p>
          <Link
            href="/contact"
            className="btn-gold mt-5 inline-flex rounded-xl px-6 py-3 text-sm"
          >
            Contact our team
          </Link>
        </section>
      </Reveal>
    </div>
  );
}
