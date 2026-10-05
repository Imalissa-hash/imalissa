import type { Metadata } from "next";
import { SettingsClient } from "@/components/account/SettingsClient";

export const metadata: Metadata = {
  title: "Account Settings",
  robots: { index: false },
};

export default function SettingsPage() {
  return <SettingsClient />;
}
