# Connecting the real external commerce API

---

## 0. Live now — DropSource BD dropship

The partner API **is** wired (docs: partner's dropship v1 reference):

| Purpose | Call |
| --- | --- |
| Credentials check | `GET {base}/me` → `{ reseller_id, shop_name, serial_number }` |
| Catalog import | `GET {base}/products` → array of products |
| Order push | `POST {base}/orders` |
| Status pull | `GET {base}/orders/track?code={order_code}` |

- `{base}` = `https://dropsourcebd.com/api/dropship/v1` (set in Admin → Settings → External API)
- Auth: `Authorization: Bearer <EXTERNAL_COMMERCE_API_KEY>`
- Adapter: `src/server/external-commerce/providers/http-provider.ts`
- Catalog importer: `src/server/external-commerce/catalog.ts`, exposed as
  `POST /api/admin/import` and the **Import screen at `/admin/import`**
  (browse the partner catalog, then import one product at a time or any
  selection; `/admin/products` links to it). The partner payload is cached
  in-process for 2 minutes so the screen and the import share one download.
- **Price rule:** partner `reseller_price` (equal to their `price`) = what we
  pay → `Product.costPrice`; partner `regular_price` = what the customer pays
  → `Product.price` (and only when it is above our cost — we never publish a
  price below cost). The storefront therefore always shows the customer price;
  the reseller price is admin-only. Order pushes send `costPrice`, so the
  customer price never reaches the partner's bill.
- Our order number is written into the push's `note` field (`Imalissa <orderNumber>`),
  which is how a pushed order can be found again in the partner's order list.

**Known gap (honest, not hidden):** the partner has no *"find order by my reference"*
endpoint, so an **ambiguous** push (timeout / 5xx) cannot be verified automatically —
the order parks in `SYNC_TIMEOUT` and the admin resolves it from Sync Center
(*Mark as synced* / *Release for retry*) after checking the partner's list.

---

## 1. Modes

Set in `.env`:

```env
EXTERNAL_COMMERCE_MODE=disabled   # or: mock | live
```

| Mode | Behaviour |
| --- | --- |
| `disabled` | Orders are saved locally, never forwarded. Sync status `NOT_CONFIGURED`. |
| `mock` | A **simulated** provider returns fake external order IDs so the whole flow (push → logs → retry → verify) can be demoed locally. **Not a real integration.** |
| `live` | Real HTTP calls through `http-provider.ts`. Requires `ENDPOINTS` + mapping functions to be filled in; otherwise fails with `NOT_CONFIGURED`. |

Mock test hooks (local only): put `SIMULATE_FAIL`, `SIMULATE_TIMEOUT` or `SIMULATE_500`
in the customer's checkout note / order note to exercise each failure class.

---

## 2. Where to integrate

Single integration point:

```
src/server/external-commerce/providers/http-provider.ts
```

1. **Credentials — `.env` only (server side, never `NEXT_PUBLIC_`):**

   ```env
   EXTERNAL_COMMERCE_MODE=live
   EXTERNAL_COMMERCE_BASE_URL=https://boss-api.example.com
   EXTERNAL_COMMERCE_API_KEY=...
   EXTERNAL_COMMERCE_API_SECRET=...
   ```

2. **Fill the `ENDPOINTS` map** exactly as documented:

   ```ts
   const ENDPOINTS = {
     createOrder: "",   // e.g. "/api/orders"
     lookupOrder: "",   // e.g. "/api/orders/{externalId}"
     orderStatus: "",   // e.g. "/api/orders/{externalId}/status"
     health: "",        // e.g. "/health"
   };
   ```

3. **Implement the three mapping functions** (they are the only place our neutral
   order shape is converted to partner fields):

   - `mapCreateOrderRequest(order: ExternalOrderInput)` → partner request body
   - `parseCreateOrderResponse(res)` → `{ externalOrderId, status? }`
   - `parseStatusResponse(res)` → our normalized status

   Input shape: `src/server/external-commerce/types.ts` (`ExternalOrderInput`).
   Our status vocabulary: `NOT_CONFIGURED · PENDING · SYNCING · SYNCED · FAILED · SYNC_TIMEOUT`.

4. **Authentication**: adjust `buildHeaders()` to the documented scheme (Bearer token,
   HMAC signature, API-key header, …). If the scheme needs a signature over the body,
   implement it there — keep secrets out of logs (the sync log stores **sanitized**
   request/response only).

---

## 3. Guarantees the sync engine already provides

(`src/server/external-commerce/sync-order.ts`)

- **One order per checkout** — `Order.idempotencyKey` is `@unique`; a double click,
  refresh, or timeout returns the *existing* order instead of creating a second one.
- **One push at a time** — a guarded `updateMany` claim acts as a row lock.
- **Timeouts are ambiguous, not failures** — classification:
  - definite failure (4xx) → `FAILED` → retry is safe
  - ambiguous (timeout / 5xx) → `SYNC_TIMEOUT` → must **verify** (lookup by
    `orderNumber`) or be manually resolved **before** any retry
- **Audit trail** — every attempt writes an `ApiSyncLog` row with sanitized
  request/response, duration and error. Secrets are never stored.
- **Honest status** — a failed push is never shown as `SYNCED` anywhere (storefront,
  account, dashboard, analytics).

Admin controls live in **`/admin/sync`** (Sync Center): *Retry* / *Verify* /
*Mark as synced (with external ID)* / *Release for retry* / *Pull latest status*.

---

## 4. Payments

- **COD** is fully implemented (default for Bangladesh).
- **bKash / Nagad / Card** are honest placeholders: the adapters throw
  `NOT_CONFIGURED` until real gateway credentials/docs exist, and checkout hides
  methods that aren't actually available. Do not add fake QR numbers or test numbers
  pretending to be real payments.

---

## 5. Rules for future changes

1. Never hardcode guessed endpoints/fields anywhere outside `http-provider.ts`.
2. Never store partner secrets in DB settings or expose them in the dashboard
   (the settings API actively rejects payload keys matching `key|secret|token|password`).
3. Never mark a sync `SYNCED` without a successful create/lookup response.
4. Every new failure path must write an `ApiSyncLog` and leave the order in a state
   an admin can act on.
