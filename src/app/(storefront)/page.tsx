import { getBanners, getCategoryTree } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { HeroCarousel, type HeroBanner } from "@/components/home/HeroCarousel";
import { HomeSectionRenderer, QuickCategoryStrip } from "@/components/home/HomeSectionRenderer";
import { TrustAndNewsletter } from "@/components/home/TrustAndNewsletter";
import { ProductRail } from "@/components/ui/ProductRail";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getFeatured } from "@/lib/queries";

export const metadata = {
  title: "Imalissa — Premium Online Shopping in Bangladesh",
  description:
    "Shop electronics, gadgets, fashion, kids & baby products, home & lifestyle at Imalissa. 100% authentic products, Cash on Delivery, fast delivery across Bangladesh.",
  alternates: { canonical: "/" },
};

export const revalidate = 300;

export default async function HomePage() {
  const [heroBanners, settings, tree, featured] = await Promise.all([
    getBanners("HERO"),
    getSettings(),
    getCategoryTree(),
    getFeatured(8),
  ]);

  const heroes: HeroBanner[] = heroBanners.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.image,
    link: b.link,
    buttonText: b.buttonText,
  }));

  const stripSlugs = tree.map((c) => c.slug).slice(0, 8);

  return (
    <div className="flex flex-col gap-14 pb-4 sm:gap-16">
      {/* Hero */}
      <HeroCarousel banners={heroes} />

      {/* Department shortcuts */}
      <QuickCategoryStrip slugs={stripSlugs} />

      {/* DB-driven sections in admin-defined order
          (BANNER_GRID sections already render <PromoGrid /> — a second,
          unconditional copy here used to duplicate the promo banners.) */}
      <HomeSectionRenderer />

      {/* Featured rail fallback */}
      {featured.items.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="Handpicked for You"
            subtitle="Our editors' choice across every department"
            href="/search"
          />
          <ProductRail products={featured.items} />
        </section>
      )}

      {/* Trust + newsletter */}
      <TrustAndNewsletter />
    </div>
  );
}
