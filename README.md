# Imalissa — Premium E-commerce Platform

Black & gold luxury multi-category reseller storefront + full admin panel, with a real
backend (auth, cart, checkout, orders) and an **honest** order-forwarding integration
architecture for an external commerce API.

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Prisma 6 · MySQL/MariaDB**.

---

## 1. Features

**Storefront**

- Homepage: announcement bar, hero, category banners, featured/bestseller/new/deal
  sections, trust strip, newsletter, footer.
- Flexible categories & subcategories (`/c/[slug]`).
- Product page: variants (color/size), image gallery with zoom, reviews, related items.
- Search + filters + sorting with facets (`/search`).
- Persistent cart (guest → merged on login), coupons, wishlist (localStorage-backed).
- Checkout for Bangladesh: division/district/area, COD + placeholder bKash/Nagad/Card,
  5-step flow, **idempotency key** prevents duplicate orders on double-click/refresh.
  - **Login required to checkout** — guests can browse & fill the cart, but
    `/checkout` (page + `/api/checkout`) only works for a signed-in account.
  - **Delivery zone by district (jela)**: Dhaka district **৳80**, every other
    district **৳130** (free over the configured threshold).
  - **Password-only signup & login** — email/phone + password starts the session directly.
    (The emailed 6-digit code step is temporarily out while hosted email is blocked;
    git history has it and `/api/auth/verify-otp` is intact for re-enabling.)
- Unique order numbers `IMAL-2026-000001`, order confirmation page, tracking
  (`/track-order`).
- Customer account: orders, addresses, reviews, profile/security settings.
- Static policy pages (`/p/[slug]`), contact form (stored + admin notification), about.
- SEO: per-page metadata, OpenGraph, JSON-LD, breadcrumbs, `sitemap.ts`, `robots.ts`.
- Performance: indexed queries, pagination, skeletons, lazy images.

**Admin panel** (`/admin`)

- Guarded panel (separate `imalissa_admin` cookie + `AdminSession` table).
- Dashboard KPIs, revenue trend, order-status donut, sync health, low stock.
- Products / categories / inventory management (CRUD + stock adjust with logs).
- Orders (status flow, notes, tracking), **Sync Center** for the external API.
- Customers, contact-message inbox, reviews moderation, coupons.
- Homepage sections & banners, site settings, admin users, audit log, analytics.

**Security**

- bcrypt hashing, httpOnly secure cookies, rate-limited auth endpoints, same-origin
  checks, zod validation everywhere, audit trail on admin mutations, no secrets in
  frontend code (`NEXT_PUBLIC_*` never carries credentials).

---

## 2. Requirements

- **Node.js ≥ 20** (this machine uses a portable install at
  `%LOCALAPPDATA%\Programs\nodejs`).
- **XAMPP MySQL/MariaDB** running on port `3306` (root, empty password by default).
- npm (bundled with Node).

---

## 3. First-time setup

```powershell
# 1. Environment
Copy-Item .env.example .env      # then edit values if needed

# 2. Install dependencies
npm install

# 3. Create schema + seed demo data (121 products, categories, banners, admin, coupons)
npm run setup                    # = prisma db push && tsx prisma/seed.ts

# 4. Start dev server
npm run dev                      # http://localhost:3000
```

> Make sure MariaDB is running first. If it isn't:
> `Start-Process C:\xampp\mysql\bin\mysqld.exe -ArgumentList "--defaults-file=C:\xampp\mysql\bin\my.ini"`

### Default accounts (from seed / `.env`)

| Role    | Email                 | Password         | Notes                          |
| ------- | --------------------- | ---------------- | ------------------------------ |
| Admin   | `admin@imalissa.com`  | `ChangeMe!2026`  | `/admin/login` — **change it** |
| Customer| `customer@imalissa.com` | `Customer!2026` | seeded test shopper          |

---

## 4. Scripts

| Script                | What it does                                  |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start dev server                              |
| `npm run build`       | Production build                              |
| `npm run start`       | Serve the production build                    |
| `npm run typecheck`   | `tsc --noEmit`                                |
| `npm run db:push`     | Push Prisma schema to MySQL (no migration)    |
| `npm run db:seed`     | Seed catalog/content (idempotent-ish)         |
| `npm run setup`       | `db:push` + `db:seed`                         |
| `npm run db:studio`   | Prisma Studio (DB browser)                    |
| `npm run db:reset`    | Drop + recreate schema, then re-seed          |

---

## 5. Environment variables

See **`.env.example`** for the annotated full list. Summary:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL used for SEO/sitemap |
| `AUTH_SECRET` | Token signing secret (server only) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created by seed |
| `EXTERNAL_COMMERCE_MODE` | `disabled` \| `mock` \| `live` |
| `EXTERNAL_COMMERCE_BASE_URL` / `_API_KEY` / `_API_SECRET` | Partner API credentials — **server only** |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Gmail SMTP — password-reset links & admin→customer emails (sign-in codes temporarily out) — **server only** |
| `BREVO_API_KEY` / `BREVO_FROM` | Brevo transactional API over HTTPS (the channel that works on Render free), tried **before** SMTP; the from-address must be a verified Brevo sender — **server only** |
| `OTP_DEV_MODE` | `true` while SMTP is empty (code returned & labeled dev) · `false` in production (503 instead of a fake send) |

**Rules**

- Never commit `.env`.
- No secret ever gets a `NEXT_PUBLIC_` prefix.
- The admin dashboard intentionally **never displays** partner API credentials.

---

## 6. Project structure

```
prisma/
  schema.prisma          # All models (Order idempotency + external sync fields, etc.)
  seed.ts                # Demo catalog + SVG artwork generation
public/uploads/          # Generated/ uploaded images (SVG + raster)
src/
  app/
    (storefront pages: /, /search, /cart, /checkout, /account, /auth, /c, /product, ...)
    api/                 # Route handlers (cart, checkout, auth, account, admin, ...)
    admin/
      login/page.tsx     # Public admin login
      (panel)/           # Guarded admin chrome + all admin pages
    sitemap.ts  robots.ts
  components/
    ui/                  # Shared storefront UI (buttons, badges, toasts, ...)
    admin/               # Admin shell + UI kit (Panel/Table/Modal/Charts ...)
    cart/ store/ home/   # Feature components
  lib/                   # db, auth, admin-auth, api, settings, cart, order, queries,
                         # validation, audit, reviews, delivery, coupon, policies ...
  server/
    external-commerce/   # Sync engine + provider adapters (mock / http)
    payment/             # COD implemented; gateways are NOT_CONFIGURED placeholders
```

---

## 7. External commerce API (boss's API) — honest status

- Modes: `disabled` (orders never forwarded → `NOT_CONFIGURED`), `mock` (simulated API
  for local demo/testing), `live` (real HTTP calls).
- **No endpoint, field name or auth scheme is invented.** The real adapter
  (`src/server/external-commerce/providers/http-provider.ts`) has empty `ENDPOINTS` and
  throws `NOT_CONFIGURED` until real docs are filled in.
- Failed/ambiguous sync (timeout, 5xx) is **never reported as success** — orders go to
  `SYNC_TIMEOUT` and must be verified or manually resolved in the **Sync Center**.
- Double-click/refresh/timeout duplicate orders are prevented by a unique
  `Order.idempotencyKey`.
- Full walkthrough: **[docs/EXTERNAL_API.md](docs/EXTERNAL_API.md)**.

---

## 8. Manual test checklist

**Customer flow**

1. Browse home → open category → open product → pick variant → add to cart.
2. Search + apply filter/sort → add another item.
3. Add coupon (seeded codes, e.g. `WELCOME10`) → cart totals update.
4. Sign up / sign in (password only — the emailed code step is temporarily out)
   → cart carries over to the account.
5. Checkout: division/district/area → pick a **Dhaka district (৳80)** vs any
   other district (**৳130**) → COD → place order (double-click the button —
   only **one** order is created). A guest opening `/checkout` is bounced to
   the login page instead.
6. Order confirmed → note order number → `/track-order` shows live status.

**Admin flow**

1. `/admin/login` → dashboard.
2. Products: create/edit/delete, image upload, stock adjust (Inventory log written).
3. Orders: change status, add note/tracking → customer tracking page reflects it.
4. Sync Center: mock-mode orders show `SYNCED`; trigger `SIMULATE_FAIL`/`SIMULATE_TIMEOUT`
   scenarios and verify retry/verify/release behave honestly.
5. Coupons / reviews / homepage / settings / admins / audit / analytics pages.

---

## 9. Type-checking

```powershell
npm run typecheck   # must exit clean
```
