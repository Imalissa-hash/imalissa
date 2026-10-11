import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/layout/CartDrawer";
import { SupportChat } from "@/components/shop/SupportChat";
import { getSettings } from "@/lib/settings";
import { getCategoryTree } from "@/lib/queries";
import type { CategoryNodeData } from "@/types/store";

/**
 * Storefront shell: announcement bar + header + cart drawer + footer +
 * the floating support chat.
 *
 * The chat lives HERE rather than on the homepage so it follows the visitor
 * to every page (product, category, cart, account, …). It is a static import
 * so the bubble paints with the first frame instead of popping in late; the
 * component defers its own network call until the browser is idle, so it
 * costs the page nothing while it loads.
 *
 * (Admin routes have their own chrome and do NOT use this layout.)
 */
export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, tree] = await Promise.all([getSettings(), getCategoryTree()]);

  const navCategories: CategoryNodeData[] = tree.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: c.image,
    icon: c.icon,
    children: c.children.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      image: ch.image,
      icon: ch.icon,
      children: [],
    })),
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header announcement={settings.announcement} categories={navCategories} logo={settings.brand.logo} />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
      <SupportChat />
    </div>
  );
}
