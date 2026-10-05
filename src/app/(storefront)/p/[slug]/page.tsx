import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { getPolicy, POLICIES, POLICY_LINKS } from "@/lib/policies";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) return { title: "Page not found" };
  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: `/p/${policy.slug}` },
    openGraph: { title: policy.title, description: policy.description },
  };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: policy.title,
    description: policy.description,
    publisher: { "@type": "Organization", name: "Imalissa" },
  };

  const others = POLICY_LINKS.filter((l) => l.slug !== policy.slug);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumbs items={[{ label: policy.title }]} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_280px]">
        <article className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
              <FileText size={19} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-mist-50">{policy.title}</h1>
              <p className="text-[0.78rem] text-mist-600">Last updated {policy.updated}</p>
            </div>
          </div>

          <p className="mt-4 text-[0.95rem] leading-relaxed text-mist-400">{policy.description}</p>

          <div className="mt-8 space-y-8">
            {policy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-xl font-semibold text-gold-gradient">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph, i) => (
                    <p key={i} className="text-[0.92rem] leading-relaxed text-mist-300">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-[0.9rem] text-mist-400">
            Still have questions about this policy?{" "}
            <Link href="/contact" className="font-semibold text-gold-400 hover:text-gold-300">
              Contact our team
            </Link>{" "}
            and we&apos;ll walk you through it.
          </div>
        </article>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-36 lg:h-fit">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.2em] text-gold-400">
              Policies &amp; Help
            </h2>
            <ul className="mt-3 space-y-2">
              {others.map((l) => (
                <li key={l.slug}>
                  <Link
                    href={`/p/${l.slug}`}
                    className="block rounded-lg px-3 py-2 text-[0.86rem] text-mist-300 transition hover:bg-white/[0.04] hover:text-gold-300"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <Link
                href="/track-order"
                className="block rounded-lg px-3 py-2 text-[0.86rem] text-mist-300 transition hover:bg-white/[0.04] hover:text-gold-300"
              >
                Track your order
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
