import Link from "next/link";
import { Facebook, Instagram, Youtube } from "@/components/ui/SocialIcons";
import { Phone, Mail, MapPin, ShieldCheck, Truck, RefreshCcw, Wallet, Send } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { getSettings } from "@/lib/settings";
import { getCategoryTree } from "@/lib/queries";
import { NewsletterForm } from "./NewsletterForm";

const iconMap = { shield: ShieldCheck, wallet: Wallet, truck: Truck, refresh: RefreshCcw };

export async function Footer() {
  const [settings, categories] = await Promise.all([getSettings(), getCategoryTree()]);
  const { contact, footer, trust } = settings;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-white/[0.07] bg-ink-900">
      {/* Trust strip */}
      <div className="border-b border-white/[0.06] bg-ink-950/60">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-4 px-6 py-7 lg:grid-cols-4 lg:px-8">
          {trust.map((item, i) => {
            const Icon = iconMap[(item.icon as keyof typeof iconMap) ?? "shield"] ?? ShieldCheck;
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold-500/25 bg-gold-500/[0.07]">
                  <Icon size={18} className="text-gold-400" />
                </div>
                <div>
                  <p className="text-[0.82rem] font-semibold text-mist-100">{item.title}</p>
                  <p className="text-[0.72rem] leading-snug text-mist-500">{item.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          {/* Brand */}
          <div>
            <Logo logoSrc={settings.brand.logo} />
            <p className="mt-4 max-w-sm text-[0.86rem] leading-relaxed text-mist-400">
              {footer.aboutText}
            </p>
            <div className="mt-5 flex gap-3">
              {[
                { href: contact.facebook, icon: Facebook, label: "Facebook" },
                { href: contact.instagram, icon: Instagram, label: "Instagram" },
                { href: contact.youtube, icon: Youtube, label: "YouTube" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-400 transition hover:border-gold-500/50 hover:text-gold-300 hover:shadow-[0_0_16px_-6px_rgba(212,175,55,0.5)]"
                >
                  <s.icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold-400">
              Shop
            </h3>
            <ul className="space-y-2.5">
              {categories.slice(0, 7).map((cat) => (
                <li key={cat.id}>
                  <Link
                    href={`/c/${cat.slug}`}
                    className="link-gold inline-block text-[0.86rem] text-mist-300"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer care */}
          <div>
            <h3 className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold-400">
              Customer Care
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: "/account", label: "My Account" },
                { href: "/track-order", label: "Track Your Order" },
                { href: "/wishlist", label: "Wishlist" },
                { href: "/p/returns-refunds", label: "Returns & Refunds" },
                { href: "/p/shipping-delivery", label: "Shipping & Delivery" },
                { href: "/p/privacy-policy", label: "Privacy Policy" },
                { href: "/contact", label: "Contact Us" },
              ].map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="link-gold inline-block text-[0.86rem] text-mist-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact + newsletter */}
          <div>
            <h3 className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold-400">
              Get in Touch
            </h3>
            <ul className="space-y-3 text-[0.86rem] text-mist-300">
              <li className="flex items-start gap-2.5">
                <Phone size={15} className="mt-0.5 shrink-0 text-gold-500" />
                <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-gold-300">
                  {contact.phone}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 shrink-0 text-gold-500" />
                <a href={`mailto:${contact.email}`} className="break-all hover:text-gold-300">
                  {contact.email}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gold-500" />
                <span>{contact.address}</span>
              </li>
            </ul>

            <p className="mt-5 mb-2 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold-400">
              Newsletter
            </p>
            <NewsletterForm />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-6 py-5 text-[0.76rem] text-mist-500 sm:flex-row lg:px-8">
          <p>{footer.copyright.replace("{{year}}", String(year))}</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {["Cash on Delivery", "bKash", "Nagad", "Visa", "Mastercard"].map((p) => (
              <span
                key={p}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-wider text-mist-400"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
