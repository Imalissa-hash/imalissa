import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SettingsClient } from "@/components/admin/system/SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Site settings editor — settings are read from the DB via lib/settings. */
export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <AdminPageHeader
        title="Site Settings"
        subtitle="Display-only storefront configuration — API credentials live in the server .env file"
      />
      <SettingsClient initial={settings} />
    </div>
  );
}
