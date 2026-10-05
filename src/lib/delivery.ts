import { prisma } from "./db";
import { getSettings } from "./settings";
import { roundMoney } from "./utils";
import { validateCouponForItems } from "./coupon";
import { badRequest } from "./errors";

/**
 * Delivery charge calculation — driven entirely by Site Settings.
 *
 * ZONE RULE (by jela/district, NOT division):
 *   • Dhaka district  →৳80
 *   • Any other district (in or out of Dhaka division) →৳130
 *
 * The settings map is keyed by district name, so `deliveryCharges["Dhaka"]`
 * holds the Dhaka-jela rate and every district without a specific entry
 * falls back to `deliveryChargeDefault` (৳130). Admin can change the two
 * numbers in Settings → Checkout without code edits.
 */
export async function calcDeliveryCharge(
  district: string,
  subtotal: number
): Promise<number> {
  const settings = await getSettings();
  const { deliveryCharges, deliveryChargeDefault, freeDeliveryMin } = settings.checkout;

  if (freeDeliveryMin > 0 && subtotal >= freeDeliveryMin) return 0;

  const charge = deliveryCharges[district];
  if (typeof charge === "number") return charge;
  return deliveryChargeDefault;
}

/** The two shipping zones a customer can pick at checkout. */
export type ShippingZone = "dhaka" | "nationwide";

/** Zone implied by the delivery district (Dhaka district → inside rate). */
export function zoneForDistrict(district: string): ShippingZone {
  return district === "Dhaka" ? "dhaka" : "nationwide";
}

/**
 * Charge for the shipping zone the customer selected.
 *
 * It uses the SAME two Settings numbers as the district rule above — a choice
 * can only pick between them, never invent a third price. `district` is where
 * the parcel actually goes: the cheaper inside-Dhaka rate is refused for any
 * other district, so tapping a row can never underpay (UI disables it too).
 */
export async function calcZoneCharge(
  zone: ShippingZone,
  subtotal: number,
  district: string
): Promise<number> {
  if (zone === "dhaka" && district !== "Dhaka") {
    throw badRequest("The Inside Dhaka delivery rate only applies to Dhaka district addresses");
  }

  const settings = await getSettings();
  const { deliveryCharges, deliveryChargeDefault, freeDeliveryMin } = settings.checkout;

  if (freeDeliveryMin > 0 && subtotal >= freeDeliveryMin) return 0;

  const charge = zone === "dhaka" ? deliveryCharges["Dhaka"] : undefined;
  return typeof charge === "number" ? charge : deliveryChargeDefault;
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  total: number;
}

export interface CheckoutItemInput {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  categoryId: string;
  lineTotal: number;
}

/** Compute final order totals server-side (never trusts client prices). */
export async function computeTotals(
  items: CheckoutItemInput[],
  district: string,
  couponCode?: string | null,
  userId?: string | null,
  /** Zone the customer picked; falls back to the district rule when absent. */
  zone?: ShippingZone
): Promise<CheckoutTotals> {
  const subtotal = roundMoney(items.reduce((s, i) => s + i.lineTotal, 0));

  let discount = 0;
  let appliedCode: string | null = null;
  if (couponCode) {
    const res = await validateCouponForItems(couponCode, subtotal, userId ?? null, items);
    discount = res.discount;
    appliedCode = res.code;
  }

  const afterDiscount = roundMoney(Math.max(subtotal - discount, 0));
  const deliveryCharge = zone
    ? await calcZoneCharge(zone, afterDiscount, district)
    : await calcDeliveryCharge(district, afterDiscount);
  const total = roundMoney(afterDiscount + deliveryCharge);

  return { subtotal, discount, couponCode: appliedCode, deliveryCharge, total };
}

/** Bangladesh administrative divisions → districts (used at checkout). */
export const BD_DIVISIONS: Record<string, string[]> = {
  Dhaka: [
    "Dhaka", "Gazipur", "Kishoreganj", "Manikganj", "Munshiganj", "Narayanganj",
    "Narsingdi", "Tangail", "Faridpur", "Gopalganj", "Madaripur", "Rajbari",
    "Shariatpur", "Brahmanbaria", "Chandpur", "Cumilla", "Noakhali", "Feni",
    "Lakshmipur", "Mymensingh", "Jamalpur", "Netrokona", "Sherpur",
  ],
  Chattogram: [
    "Chattogram", "Cox's Bazar", "Bandarban", "Brahmanbaria", "Chandpur",
    "Comilla", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  ],
  Rajshahi: [
    "Rajshahi", "Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj",
    "Pabna", "Sirajganj", "Bagerhat", "Jashore", "Khulna", "Kushtia",
    "Magura", "Meherpur", "Narail", "Satkhira", "Rangpur", "Dinajpur",
    "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh",
    "Thakurgaon", "Bhola", "Barishal", "Patuakhali", "Pirojpur",
  ],
  Khulna: [
    "Khulna", "Bagerhat", "Jashore", "Jhenaidah", "Kushtia", "Magura",
    "Meherpur", "Narail", "Satkhira",
  ],
  Barishal: ["Barishal", "Bhola", "Patuakhali", "Pirojpur", "Barguna"],
  Sylhet: ["Sylhet", "Habiganj", "Moulvibazar", "Sunamganj"],
  Rangpur: [
    "Rangpur", "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat",
    "Nilphamari", "Panchagarh", "Thakurgaon",
  ],
  Mymensingh: ["Mymensingh", "Jamalpur", "Netrokona", "Sherpur"],
};

/** Common delivery areas per major district (free-text fallback allowed). */
export const BD_AREAS: Record<string, string[]> = {
  Dhaka: [
    "Dhanmondi", "Gulshan", "Banani", "Mirpur", "Uttara", "Motijheel", "Mohakhali",
    "Bashundhara R/A", "Baridhara", "Old Dhaka", "Badda", "Rampura", "Malibagh",
    "Shyamli", "Kafrul", "Cantonment", "Farmgate", "Elephant Road", "Lalmatia",
    " Mohammadpur", "Azimpur", "Savar", "Keraniganj", "Tongi", "Narayanganj",
  ],
  Chattogram: ["Agrabad", "Nasirabad", "Khulshi", "Pahartali", "Halishahar", "Oxygen", "Muradpur", "New Market"],
  Sylhet: ["Zindabazar", "Ambarkhana", "Shahparan", "Subid Bazar"],
  Khulna: ["Sonadanga", "Khalishpur", "Boyra", "Ghotkhali"],
  Rajshahi: ["Shaheb Bazar", "Uposhohor", "Motihar"],
};

export function divisionsList(): { name: string; districts: string[] }[] {
  return Object.entries(BD_DIVISIONS).map(([name, districts]) => ({ name, districts }));
}
