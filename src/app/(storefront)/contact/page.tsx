import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Imalissa team — order help, product questions, returns and partnerships.",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Contact Us" }]} />

      <div className="mb-7 mt-3 max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-mist-50">
          Contact <span className="text-gold-gradient">Us</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          Questions about an order, a product or a return? Our team is ready to help during
          business hours.
        </p>
      </div>

      <ContactForm contact={settings.contact} />
    </div>
  );
}
