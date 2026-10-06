import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getHomeSections, getSectionProducts } from "@/lib/queries";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductRail } from "@/components/ui/ProductRail";
import { CategoryTiles } from "./CategoryTiles";
import { PromoGrid } from "./PromoGrid";
import { RecentlyViewed } from "./RecentlyViewed";

/**
 * Renders the homepage sections in the order / visibility defined in
 * Admin → Homepage → Sections. No code edits needed to reorder or hide.
 *
 * All sections resolve concurrently (Promise.all). The previous serial
 * `for … await` loop stacked 10+ database round-trips on top of each
 * other and was the main cause of the slow homepage.
 */
export async function HomeSectionRenderer() {
  const sections = await getHomeSections();

  const jsx = await Promise.all(
    sections.map(async (section): Promise<React.ReactNode> => {
      if (section.key === "hero_categories" || section.type === "CATEGORY_GRID") {
        return <CategoryTiles key={section.id} title={section.title} />;
      }

      if (section.type === "BANNER_GRID") {
        return (
          <div key={section.id}>
            <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
              <SectionHeading
                title={section.title}
                subtitle={section.subtitle}
                href={section.link ?? undefined}
                linkLabel={section.buttonText ?? "View all"}
              />
            </div>
            <PromoGrid />
          </div>
        );
      }

      if (section.type === "TEXT_ONLY") {
        if (section.key === "recently_viewed") {
          return (
            <div key={section.id}>
              <RecentlyViewed />
            </div>
          );
        }
        return null;
      }

      // PRODUCT_GRID → horizontal rail (native swipe on mobile)
      const products = await getSectionProducts(section.source, section.itemIds, 10);
      if (!products.length) return null;

      return (
        <section key={section.id} className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title={section.title}
            subtitle={section.subtitle}
            href={section.link ?? `/search?sort=${section.source === "deals" ? "discount" : section.source === "new_arrivals" ? "newest" : "relevance"}`}
            linkLabel={section.buttonText ?? "View all"}
          />
          <ProductRail products={products} compact={section.key === "electronics"} />
        </section>
      );
    })
  );

  // Block flow with space-y, not flex: a flex child carrying mx-auto
  // shrink-wraps (auto cross-margins cancel stretch), so a wide section —
  // e.g. a product rail — would set the page width and scale the whole
  // homepage down on phones.
  return <div className="space-y-14 sm:space-y-16">{jsx}</div>;
}

/** Slim strip under the hero: department shortcuts. */
export async function QuickCategoryStrip({ slugs }: { slugs: string[] }) {
  const { prisma } = await import("@/lib/db");
  const cats = await prisma.category.findMany({
    where: { slug: { in: slugs }, isActive: true },
    orderBy: { name: "asc" },
    select: { name: true, slug: true, icon: true },
  });
  if (!cats.length) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {cats.map((c) => (
          <Link
            key={c.slug}
            href={`/c/${c.slug}`}
            className="group flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[0.84rem] font-medium text-mist-200 transition-all hover:border-gold-500/50 hover:bg-gold-500/[0.08] hover:text-gold-300"
          >
            {c.name}
            <ArrowRight size={13} className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </section>
  );
}
