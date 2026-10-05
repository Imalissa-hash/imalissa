"use client";

import { SectionsEditor, type SectionRow } from "./SectionsEditor";
import { BannersManager, type BannerRow } from "./BannersManager";

/**
 * Homepage content manager: section ordering/visibility editor on top,
 * per-position banner manager below. Both talk to the homepage APIs and
 * re-sync from the server after every successful mutation.
 */
export function HomepageClient({
  sections,
  banners,
}: {
  sections: SectionRow[];
  banners: BannerRow[];
}) {
  return (
    <div className="space-y-8">
      <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[0.82rem] leading-relaxed text-mist-500">
        Sections render top-to-bottom on the storefront home page — only sections marked visible are
        shown. Banners appear in their position slot while active. Changes go live immediately.
      </p>
      <SectionsEditor sections={sections} />
      <BannersManager banners={banners} />
    </div>
  );
}
