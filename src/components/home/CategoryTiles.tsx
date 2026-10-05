import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCategoryTree } from "@/lib/queries";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * Featured category tiles — top-level categories with product counts.
 */
export async function CategoryTiles({ title = "Shop by Category" }: { title?: string }) {
  const [tree, counts] = await Promise.all([
    getCategoryTree(false),
    prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { status: "ACTIVE" } }),
  ]);

  const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const top = tree.slice(0, 10);

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <SectionHeading title={title} subtitle="Everything you need, one trusted destination" href="/search" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {top.map((cat, i) => {
          // Count includes descendants (approx: direct products + children counts).
          const direct = countMap.get(cat.id) ?? 0;
          const childTotal = cat.children.reduce((s, ch) => s + (countMap.get(ch.id) ?? 0), 0);
          const total = direct + childTotal;

          return (
            <Reveal key={cat.id} delay={Math.min(i * 0.05, 0.3)}>
              <Link
                href={`/c/${cat.slug}`}
                className="group relative flex h-full flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-ink-800 to-ink-900 px-4 py-6 text-center transition-all duration-400 hover:-translate-y-1.5 hover:border-gold-500/40 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(212,175,55,0.15)]"
              >
                <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gold-500/10 blur-2xl transition-all duration-500 group-hover:bg-gold-500/25" />
                <span className="relative h-24 w-24 overflow-hidden rounded-xl border border-gold-500/20 bg-ink-950">
                  {cat.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cat.image}
                      alt={cat.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  )}
                </span>
                <span className="relative flex flex-col">
                  <span className="text-[0.88rem] font-semibold text-mist-100 transition group-hover:text-gold-300">
                    {cat.name}
                  </span>
                  <span className="text-[0.68rem] text-mist-500">{total} products</span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
