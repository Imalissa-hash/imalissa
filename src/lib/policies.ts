/**
 * Static policy / info pages served at /p/[slug].
 * Content is code-owned (not admin-editable) so wording stays consistent
 * with what the business actually offers — update here when policies change.
 */

export interface PolicySection {
  heading: string;
  body: string[];
}

export interface Policy {
  slug: string;
  title: string;
  description: string;
  updated: string; // human-readable
  sections: PolicySection[];
}

export const POLICIES: Policy[] = [
  {
    slug: "shipping-delivery",
    title: "Shipping & Delivery",
    description:
      "How we deliver across Bangladesh — charges by district, delivery windows and what happens if nobody is home.",
    updated: "January 2026",
    sections: [
      {
        heading: "Coverage",
        body: [
          "We deliver nationwide across all 8 divisions of Bangladesh, including remote districts served by our courier partners.",
          "Delivery charges depend on your district (jela) and are shown before you confirm the order — no hidden fees at the door.",
        ],
      },
      {
        heading: "Charges & free delivery",
        body: [
          "Inside Dhaka district the charge is ৳80; every other district in Bangladesh is charged ৳130.",
          "Orders above the free-delivery threshold shown at checkout are delivered free of charge.",
          "The exact charge for your address is calculated live in the checkout form from the district you select.",
        ],
      },
      {
        heading: "Delivery windows",
        body: [
          "Orders are processed on business days. Typical delivery takes 2–5 days depending on your location.",
          "You receive an order number immediately after checkout — use the Track Order page to see live status any time.",
          "Once your order ships, a courier tracking number appears on your order page.",
        ],
      },
      {
        heading: "If nobody is available",
        body: [
          "Our courier will call the phone number on the order. Please keep the number reachable.",
          "Failed deliveries are re-attempted; repeated failures return the parcel to us, and our support team will contact you to arrange the next step.",
        ],
      },
      {
        heading: "Inspect before you accept",
        body: [
          "For Cash on Delivery orders we recommend checking the parcel for visible damage before paying the rider.",
          "If a parcel looks tampered with, you can refuse delivery at no cost.",
        ],
      },
    ],
  },
  {
    slug: "returns-refunds",
    title: "Returns & Refunds",
    description:
      "Our 7-day return policy — what can be returned, how to start a return, and when your refund arrives.",
    updated: "January 2026",
    sections: [
      {
        heading: "7-day return window",
        body: [
          "You can request a return within 7 days of delivery for products that arrive damaged, defective, different from the description, or unused with all tags and packaging intact.",
          "Some categories cannot be returned for hygiene or authenticity reasons (e.g. undergarments, cosmetics, food items) — these are marked on the product page where applicable.",
        ],
      },
      {
        heading: "How to start a return",
        body: [
          "Contact support with your order number (find it in My Orders or on your confirmation) and photos of the issue where relevant.",
          "Our team reviews the request and arranges a pickup or return instruction — please do not send items back without confirmation, as untracked parcels can get lost.",
        ],
      },
      {
        heading: "Refund timing",
        body: [
          "Once the returned item is received and inspected, the refund is issued to your original payment route.",
          "Cash on Delivery orders are refunded via the method agreed with our support team (bank transfer or bKash/Nagad as available at the time).",
          "Refunds are processed within a few business days of approval; your bank or wallet may take additional time to post it.",
        ],
      },
      {
        heading: "Exchange",
        body: [
          "Prefer a different size or colour? Tell us in the return request — if the replacement is in stock we will ship it as soon as the original is collected.",
        ],
      },
    ],
  },
  {
    slug: "warranty",
    title: "Warranty Policy",
    description: "What is covered by product warranties and how warranty claims are handled.",
    updated: "January 2026",
    sections: [
      {
        heading: "Warranty coverage",
        body: [
          "Warranty terms follow the manufacturer or official distributor warranty where one applies. The applicable term is stated on the product page when known.",
          "Warranty covers manufacturing defects under normal use. It does not cover physical damage, liquid damage, unauthorized repair, or normal wear.",
        ],
      },
      {
        heading: "Making a claim",
        body: [
          "Open a claim through our contact channels with your order number and a description (plus photos/video where helpful).",
          "If the product needs factory inspection, we coordinate the handover — do not open or modify the device yourself, as that can void the warranty.",
        ],
      },
      {
        heading: "Outcome",
        body: [
          "Where a repair is not economical or parts are unavailable, the manufacturer or our team may replace the unit or resolve it per the applicable warranty terms.",
          "Items outside the warranty period can still be sent for paid service — ask our support team for options.",
        ],
      },
    ],
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    description:
      "What data Imalissa collects, why we collect it, and the choices you have about it.",
    updated: "January 2026",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account details you provide: name, phone number, email and delivery addresses.",
          "Order information: products ordered, totals, delivery location and payment method (we never store full card numbers).",
          "Technical data: cookies and session identifiers needed to keep you signed in, remember your cart and secure the site.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To process and deliver orders, send status updates, and provide customer support.",
          "To prevent fraud, abuse and duplicate orders, and to improve the shopping experience.",
          "To send promotional messages only where you have opted in — you can opt out any time.",
        ],
      },
      {
        heading: "Sharing",
        body: [
          "We share only what is necessary to fulfil your order: delivery address and contact number with the courier handling your parcel, and payment details with the payment provider you chose.",
          "We do not sell your personal data.",
        ],
      },
      {
        heading: "Security & your choices",
        body: [
          "Passwords are stored hashed; sessions are httpOnly cookies; admin access is separately authenticated and audited.",
          "You can view or update your profile and saved addresses anytime from My Account, and request deletion of your account by contacting support.",
        ],
      },
    ],
  },
  {
    slug: "payment-options",
    title: "Payment Options",
    description:
      "Cash on Delivery, and the digital payment methods available at Imalissa checkout.",
    updated: "January 2026",
    sections: [
      {
        heading: "Cash on Delivery (COD)",
        body: [
          "Pay the rider in cash when your order arrives — available nationwide.",
          "Please keep the exact amount ready where possible; riders may not always carry change.",
        ],
      },
      {
        heading: "Digital payments",
        body: [
          "bKash, Nagad and card payments appear as options at checkout only when they are actually enabled and configured on the store.",
          "If an option is greyed out, it is temporarily unavailable — COD remains an option and you can contact support for help.",
          "No card details are ever stored on our servers; card payments are handled by the payment provider.",
        ],
      },
      {
        heading: "Pricing & receipts",
        body: [
          "All prices are in Bangladeshi Taka (৳) and include any applicable discounts from coupon codes you apply.",
          "Your order confirmation page and My Orders history serve as your receipt; contact support for a copy anytime.",
        ],
      },
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    description: "The terms that govern your use of the Imalissa website and services.",
    updated: "January 2026",
    sections: [
      {
        heading: "Using this site",
        body: [
          "By placing an order you confirm that the information you provide is accurate and that you are able to enter into a purchase agreement.",
          "We may refuse or cancel an order where there is a clear pricing error, stock issue, or suspected fraud — and we will tell you when that happens.",
        ],
      },
      {
        heading: "Pricing & availability",
        body: [
          "Product prices and stock levels can change without notice. The price shown at the moment your order is confirmed is the price you pay.",
          "If an item becomes unavailable after your order, we contact you with alternatives, a replacement, or a full refund.",
        ],
      },
      {
        heading: "Product information",
        body: [
          "We work to keep descriptions, images and specifications accurate. Colour representation can vary slightly by screen.",
          "Catalogue content (reviews, ratings) is moderated; fake or incentivised reviews are not published.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "The Imalissa name, logo, design and site content belong to us and may not be used without permission.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "Questions about these terms can be sent through the Contact Us page — we respond during business hours.",
        ],
      },
    ],
  },
];

export const POLICY_LINKS = POLICIES.map((p) => ({ slug: p.slug, label: p.title }));

export function getPolicy(slug: string): Policy | undefined {
  return POLICIES.find((p) => p.slug === slug);
}
