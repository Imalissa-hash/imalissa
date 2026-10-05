import type { Metadata } from "next";
import type { Banner, HomeSection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { HomepageClient } from "@/components/admin/content/HomepageClient";
import type { SectionRow } from "@/components/admin/content/SectionsEditor";
import type { BannerRow } from "@/components/admin/content/BannersManager";

export const metadata: Metadata = {
  title: "Homepage",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Serialize a section row (itemIds Json → string[], Date → ISO). */
function toSectionRow(s: HomeSection): SectionRow {
  return {
    id: s.id,
    key: s.key,
    title: s.title,
    subtitle: s.subtitle,
    type: s.type,
    source: s.source,
    itemIds: Array.isArray(s.itemIds)
      ? s.itemIds.filter((x): x is string => typeof x === "string")
      : null,
    image: s.image,
    link: s.link,
    buttonText: s.buttonText,
    order: s.order,
    isVisible: s.isVisible,
    updatedAt: new Date(s.updatedAt).toISOString(),
  };
}

/** Serialize a banner row (Date → ISO). */
function toBannerRow(b: Banner): BannerRow {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.image,
    mobileImage: b.mobileImage,
    link: b.link,
    buttonText: b.buttonText,
    position: b.position,
    isActive: b.isActive,
    positionIndex: b.positionIndex,
    createdAt: new Date(b.createdAt).toISOString(),
    updatedAt: new Date(b.updatedAt).toISOString(),
  };
}

/** Admin homepage editor — sections order/visibility + banner slots. */
export default async function AdminHomepagePage() {
  const [sections, banners] = await Promise.all([
    prisma.homeSection.findMany({ orderBy: { order: "asc" } }),
    prisma.banner.findMany({ orderBy: [{ position: "asc" }, { positionIndex: "asc" }] }),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Homepage"
        subtitle={`${sections.length} section${sections.length === 1 ? "" : "s"} · ${banners.length} banner${banners.length === 1 ? "" : "s"}`}
      />
      <HomepageClient
        sections={sections.map(toSectionRow)}
        banners={banners.map(toBannerRow)}
      />
    </div>
  );
}
