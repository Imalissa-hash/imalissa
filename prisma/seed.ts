/**
 * Imalissa seed script.
 *
 * Creates: admin account, customers, settings, category tree, brands,
 * ~150 products with variants + on-brand SVG artwork, banners, homepage
 * sections, coupons, and sample reviews.
 *
 * Run:  npm run db:seed
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110);

const D = (n: number) => new Prisma.Decimal(n);

const UPLOAD_ROOT = join(process.cwd(), "public", "uploads");
const PRODUCT_DIR = join(UPLOAD_ROOT, "products");
const BANNER_DIR = join(UPLOAD_ROOT, "banners");

function ensureDirs() {
  mkdirSync(PRODUCT_DIR, { recursive: true });
  mkdirSync(BANNER_DIR, { recursive: true });
}

/** Read a lucide icon's node array: [[tag, attrs], ...] */
async function iconNode(name: string): Promise<[string, Record<string, string>][] | null> {
  try {
    const mod = await import(
      /* webpackIgnore: true */ `lucide-react/dist/esm/icons/${name}.js`
    );
    const node = (mod as { default?: unknown; __iconNode?: unknown }).default ??
      (mod as { __iconNode?: unknown }).__iconNode;
    if (Array.isArray(node)) return node as [string, Record<string, string>][];
  } catch {
    /* fall through */
  }
  return null;
}

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

async function renderIcon(name: string, x: number, y: number, size: number, color: string, stroke = 1.4): Promise<string> {
  const node = await iconNode(name);
  if (!node) return "";
  const scale = size / 24;
  const parts = node
    .map(([tag, attrs]) => `<${tag} ${attrsToString({ ...attrs, "stroke-width": String(stroke) })} />`)
    .join("");
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(3)})" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${parts}</g>`;
}

/**
 * On-brand product artwork: deep black gradient, champagne-gold linework,
 * category icon, product initial + brand mark. Looks intentional (not a
 * grey box), and admins can replace it by uploading real photos.
 */
async function productSvg(opts: {
  title: string;
  brand: string;
  icon: string;
  variant: number; // 0..2 — background variation
  accent?: string;
}): Promise<string> {
  const { title, brand, icon, variant } = opts;
  const angle = [135, 160, 115][variant % 3];
  const iconColor = ["#d4af37", "#f3dda1", "#c9a227"][variant % 3];
  const bigIcon = await renderIcon(icon, 300, 210, 200, iconColor, 1.1);
  const smallIcon = await renderIcon(icon, 44, 44, 34, "#d4af37", 1.6);
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const titleEsc = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const brandEsc = brand.replace(/&/g, "&amp;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="#15151a"/>
      <stop offset="55%" stop-color="#0c0c0f"/>
      <stop offset="100%" stop-color="#070708"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3dda1"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#967423"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#d4af37" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.025" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="640" height="800" fill="url(#bg)"/>
  <rect width="640" height="800" fill="url(#grid)"/>
  <rect width="640" height="800" fill="url(#glow)"/>
  <rect x="18" y="18" width="604" height="764" fill="none" stroke="#d4af37" stroke-opacity="0.35" stroke-width="1.5" rx="6"/>
  <rect x="26" y="26" width="588" height="748" fill="none" stroke="#d4af37" stroke-opacity="0.14" stroke-width="1" rx="4"/>
  <circle cx="320" cy="310" r="150" fill="none" stroke="#d4af37" stroke-opacity="0.18" stroke-width="1.5"/>
  <circle cx="320" cy="310" r="120" fill="#0a0a0c" stroke="#d4af37" stroke-opacity="0.3" stroke-width="1.5"/>
  ${bigIcon}
  <text x="44" y="60" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="url(#gold)" letter-spacing="4">IMALISSA</text>
  ${smallIcon}
  <text x="320" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-weight="700" fill="url(#gold)" letter-spacing="6">${initials}</text>
  <text x="320" y="612" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="600" fill="#ececef">${titleEsc.length > 26 ? titleEsc.slice(0, 25) + "…" : titleEsc}</text>
  <line x1="230" y1="640" x2="410" y2="640" stroke="url(#gold)" stroke-width="2"/>
  <text x="320" y="676" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#8b8b95" letter-spacing="3">${brandEsc.toUpperCase().slice(0, 24)}</text>
  <text x="320" y="752" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b6b75" letter-spacing="6">PREMIUM • AUTHENTIC • DELIVERED</text>
</svg>`;
}

async function bannerSvg(opts: {
  kicker: string;
  title: string;
  subtitle: string;
  icon: string;
  wide?: boolean;
  tone?: number;
}): Promise<string> {
  const w = opts.wide ? 1600 : 1200;
  const h = opts.wide ? 720 : 640;
  const angle = [120, 150, 100][opts.tone ?? 0];
  const icon = await renderIcon(opts.icon, w - 340, h / 2 - 130, 260, "#d4af37", 1);
  const titleEsc = opts.title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const subEsc = opts.subtitle.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="#17171d"/>
      <stop offset="50%" stop-color="#0d0d10"/>
      <stop offset="100%" stop-color="#060607"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fdf8ec"/>
      <stop offset="45%" stop-color="#e3b452"/>
      <stop offset="100%" stop-color="#b8942c"/>
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="45%" r="42%">
      <stop offset="0%" stop-color="#d4af37" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <path d="M0 ${h} L${w * 0.45} 0 L${w * 0.58} 0 L0 ${h} Z" fill="#d4af37" fill-opacity="0.05"/>
  <circle cx="${w - 220}" cy="${h / 2}" r="190" fill="none" stroke="#d4af37" stroke-opacity="0.25" stroke-width="2"/>
  <circle cx="${w - 220}" cy="${h / 2}" r="150" fill="none" stroke="#d4af37" stroke-opacity="0.12" stroke-width="1"/>
  ${icon}
  <text x="90" y="${h * 0.34}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#d4af37" letter-spacing="8">${opts.kicker.toUpperCase()}</text>
  <text x="90" y="${h * 0.5}" font-family="Georgia, serif" font-size="76" font-weight="700" fill="url(#gold)">${titleEsc}</text>
  <text x="90" y="${h * 0.62}" font-family="Arial, sans-serif" font-size="26" fill="#b3b3bb">${subEsc}</text>
  <rect x="90" y="${h * 0.7}" width="240" height="64" rx="8" fill="url(#gold)"/>
  <text x="210" y="${h * 0.7 + 40}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#14100a" letter-spacing="2">SHOP NOW</text>
  <text x="${w - 80}" y="${h - 40}" text-anchor="end" font-family="Georgia, serif" font-size="26" fill="#d4af37" letter-spacing="6" opacity="0.7">IMALISSA</text>
</svg>`;
}

async function writeSvg(dir: string, name: string, svg: string): Promise<string> {
  const rel = `/uploads/${dir}/${name}.svg`;
  const target = join(UPLOAD_ROOT, dir);
  mkdirSync(target, { recursive: true });
  const abs = join(target, `${name}.svg`);
  writeFileSync(abs, svg, "utf8");
  return rel;
}

// ------------------------------------------------------------
// Catalog data
// ------------------------------------------------------------

interface SeedCategory {
  name: string;
  icon: string;
  children?: { name: string; icon?: string }[];
  seo?: string;
}

const CATEGORY_TREE: SeedCategory[] = [
  {
    name: "Electronics",
    icon: "headphones",
    seo: "Electronics in Bangladesh — headphones, speakers, laptops, phones & more at Imalissa",
    children: [
      { name: "Headphones", icon: "headphones" },
      { name: "Speakers", icon: "speaker" },
      { name: "Laptops", icon: "laptop" },
      { name: "Phones", icon: "smartphone" },
      { name: "Cameras", icon: "camera" },
      { name: "TV & Audio", icon: "tv" },
      { name: "Gaming", icon: "gamepad-2" },
    ],
  },
  {
    name: "Gadgets",
    icon: "cpu",
    seo: "Smart gadgets & wearables — smartwatches, trackers, power banks at Imalissa",
    children: [
      { name: "Smart Watches", icon: "watch" },
      { name: "Power Banks", icon: "battery-charging" },
      { name: "Chargers & Cables", icon: "plug" },
      { name: "Drones", icon: "plane" },
      { name: "Action Cameras", icon: "video" },
    ],
  },
  {
    name: "Men",
    icon: "shirt",
    seo: "Men's fashion — shirts, t-shirts, pants, jackets & footwear at Imalissa",
    children: [
      { name: "Shirts", icon: "shirt" },
      { name: "T-Shirts", icon: "shirt" },
      { name: "Pants", icon: "ruler" },
      { name: "Jackets", icon: "shield" },
      { name: "Footwear", icon: "footprints" },
      { name: "Watches", icon: "watch" },
    ],
  },
  {
    name: "Women",
    icon: "sparkles",
    seo: "Women's fashion — kurtis, dresses, bags, jewellery & more at Imalissa",
    children: [
      { name: "Kurtis & Tunics", icon: "sparkles" },
      { name: "Dresses", icon: "sparkles" },
      { name: "Sarees", icon: "sparkles" },
      { name: "Bags & Handbags", icon: "shopping-bag" },
      { name: "Jewellery", icon: "gem" },
      { name: "Footwear", icon: "footprints" },
    ],
  },
  {
    name: "Boys",
    icon: "user",
    seo: "Boys' clothing — t-shirts, shirts, shorts, school wear at Imalissa",
    children: [
      { name: "T-Shirts", icon: "shirt" },
      { name: "Shirts", icon: "shirt" },
      { name: "Shorts & Pants", icon: "ruler" },
      { name: "Ethnic Wear", icon: "sparkles" },
    ],
  },
  {
    name: "Girls",
    icon: "heart",
    seo: "Girls' clothing — frocks, tops, ethnic wear & more at Imalissa",
    children: [
      { name: "Frocks & Dresses", icon: "sparkles" },
      { name: "Tops", icon: "shirt" },
      { name: "Ethnic Wear", icon: "sparkles" },
      { name: "Hair Accessories", icon: "gem" },
    ],
  },
  {
    name: "Baby",
    icon: "baby",
    seo: "Baby products — clothing, feeding, care & essentials at Imalissa",
    children: [
      { name: "Baby Clothing", icon: "baby" },
      { name: "Feeding", icon: "milk" },
      { name: "Diapering", icon: "package" },
      { name: "Toys", icon: "puzzle" },
    ],
  },
  {
    name: "Fashion",
    icon: "crown",
    children: [
      { name: "Sunglasses", icon: "glasses" },
      { name: "Caps & Hats", icon: "crown" },
      { name: "Belts", icon: "ruler" },
      { name: "Scarves", icon: "wind" },
    ],
  },
  {
    name: "Beauty",
    icon: "flower-2",
    children: [
      { name: "Skincare", icon: "flower-2" },
      { name: "Makeup", icon: "sparkles" },
      { name: "Fragrance", icon: "wind" },
      { name: "Hair Care", icon: "scissors" },
    ],
  },
  {
    name: "Home & Lifestyle",
    icon: "lamp",
    seo: "Home & lifestyle — décor, lighting, kitchen, bedding at Imalissa",
    children: [
      { name: "Home Décor", icon: "lamp" },
      { name: "Kitchen", icon: "utensils" },
      { name: "Bedding", icon: "bed" },
      { name: "Storage", icon: "package" },
      { name: "Air & Climate", icon: "fan" },
    ],
  },
  {
    name: "Accessories",
    icon: "watch",
    children: [
      { name: "Wallets", icon: "wallet" },
      { name: "Watches", icon: "watch" },
      { name: "Rings & Jewellery", icon: "gem" },
      { name: "Phone Accessories", icon: "smartphone" },
    ],
  },
  {
    name: "Sports",
    icon: "dumbbell",
    children: [
      { name: "Fitness", icon: "dumbbell" },
      { name: "Cricket", icon: "trophy" },
      { name: "Cycling", icon: "bike" },
    ],
  },
];

const BRANDS = [
  "Samsung", "Apple", "Sony", "JBL", "Xiaomi", "Anker", "Nike", "Adidas", "H&M",
  "Zara", "Levi's", "Woodland", "Fossil", "Titan", "Casio", "Lakme", "Maybelline",
  "Nivea", "The Body Shop", "Walton", "Beautiful", "Rich", "Apex", "Bata", "Gucci",
  "Prada", "Local Premium", "Imalissa Signature",
];

interface ProductTemplate {
  name: string;
  category: string; // top-level category path "Electronics>Headphones"
  brand?: string;
  price: number;
  compareAt?: number;
  icon: string;
  base: "electronics" | "fashion" | "beauty" | "home" | "kids" | "sports";
  colors?: string[];
  sizes?: string[];
  specs?: [string, string][];
  description?: string;
}

const PRODUCTS: ProductTemplate[] = [
  // Electronics
  { name: "Wireless Noise-Cancelling Headphones", category: "Electronics>Headphones", brand: "Sony", price: 4850, compareAt: 6500, icon: "headphones", base: "electronics", colors: ["Black", "Silver"], specs: [["Driver", "40mm"], ["Battery", "Up to 30 hours"], ["Bluetooth", "5.3"], ["ANC", "Active Noise Cancelling"]] },
  { name: "True Wireless Earbuds Pro", category: "Electronics>Headphones", brand: "JBL", price: 2150, compareAt: 2990, icon: "headphones", base: "electronics", colors: ["Black", "White"] },
  { name: "Gaming Headset RGB", category: "Electronics>Headphones", brand: "Local Premium", price: 1750, compareAt: 2400, icon: "gamepad-2", base: "electronics", colors: ["Black"] },
  { name: "Portable Bluetooth Speaker 40W", category: "Electronics>Speakers", brand: "JBL", price: 3900, compareAt: 5200, icon: "speaker", base: "electronics", colors: ["Black", "Blue"] },
  { name: "Smart Home Speaker with Assistant", category: "Electronics>Speakers", brand: "Xiaomi", price: 3300, icon: "speaker", base: "electronics", colors: ["Charcoal"] },
  { name: "Ultraslim Laptop 15.6\" Core i5", category: "Electronics>Laptops", brand: "Samsung", price: 62500, compareAt: 68000, icon: "laptop", base: "electronics", specs: [["Processor", "Intel Core i5 12th Gen"], ["RAM", "8 GB"], ["Storage", "512 GB SSD"], ["Display", "15.6\" FHD"]] },
  { name: "Creator Laptop 14\" Ryzen 7", category: "Electronics>Laptops", brand: "Apple", price: 94500, icon: "laptop", base: "electronics" },
  { name: "Budget Laptop 14\" Celeron", category: "Electronics>Laptops", brand: "Walton", price: 27500, compareAt: 31000, icon: "laptop", base: "electronics" },
  { name: "5G Smartphone 8/256GB", category: "Electronics>Phones", brand: "Xiaomi", price: 26990, compareAt: 29990, icon: "smartphone", base: "electronics", colors: ["Midnight Black", "Sky Blue"] },
  { name: "Flagship Smartphone 12/512GB", category: "Electronics>Phones", brand: "Samsung", price: 89990, icon: "smartphone", base: "electronics", colors: ["Phantom Black", "Cream"] },
  { name: "Entry Smartphone 4/128GB", category: "Electronics>Phones", brand: "Walton", price: 12990, compareAt: 14500, icon: "smartphone", base: "electronics" },
  { name: "Mirrorless Camera 24MP + Lens", category: "Electronics>Cameras", brand: "Sony", price: 78500, compareAt: 84000, icon: "camera", base: "electronics" },
  { name: "Action Camera 4K Waterproof", category: "Electronics>Cameras", brand: "Local Premium", price: 9800, compareAt: 13500, icon: "video", base: "electronics" },
  { name: "43\" 4K Smart Television", category: "Electronics>TV & Audio", brand: "Samsung", price: 46500, compareAt: 52000, icon: "tv", base: "electronics" },
  { name: "55\" QLED Smart Television", category: "Electronics>TV & Audio", brand: "Xiaomi", price: 72990, icon: "tv", base: "electronics" },
  { name: "Wireless Controller for Console", category: "Electronics>Gaming", brand: "Sony", price: 5400, icon: "gamepad-2", base: "electronics", colors: ["Black", "White"] },
  { name: "Mechanical RGB Keyboard", category: "Electronics>Gaming", brand: "Local Premium", price: 3250, compareAt: 4200, icon: "keyboard", base: "electronics" },
  { name: "Gaming Mouse 16000 DPI", category: "Electronics>Gaming", brand: "Xiaomi", price: 1950, compareAt: 2600, icon: "mouse", base: "electronics" },

  // Gadgets
  { name: "Smart Watch AMOLED Bluetooth Call", category: "Gadgets>Smart Watches", brand: "Xiaomi", price: 3450, compareAt: 4990, icon: "watch", base: "electronics", colors: ["Black", "Gold", "Silver"] },
  { name: "Fitness Tracker Band", category: "Gadgets>Smart Watches", brand: "Anker", price: 1650, compareAt: 2200, icon: "watch", base: "electronics", colors: ["Black", "Blue"] },
  { name: "Premium Smartwatch with GPS", category: "Gadgets>Smart Watches", brand: "Apple", price: 32500, icon: "watch", base: "electronics", colors: ["Space Grey", "Starlight"] },
  { name: "Power Bank 20000mAh Fast Charge", category: "Gadgets>Power Banks", brand: "Anker", price: 2350, compareAt: 3100, icon: "battery-charging", base: "electronics" },
  { name: "Power Bank 10000mAh Slim", category: "Gadgets>Power Banks", brand: "Xiaomi", price: 1450, icon: "battery-charging", base: "electronics", colors: ["White", "Black"] },
  { name: "65W GaN Fast Charger", category: "Gadgets>Chargers & Cables", brand: "Anker", price: 2750, compareAt: 3400, icon: "plug", base: "electronics" },
  { name: "Braided USB-C Cable 2m", category: "Gadgets>Chargers & Cables", brand: "Anker", price: 650, compareAt: 900, icon: "cable", base: "electronics", colors: ["Black", "Red"] },
  { name: "Wireless Charging Pad 15W", category: "Gadgets>Chargers & Cables", brand: "Xiaomi", price: 1250, icon: "zap", base: "electronics" },
  { name: "Camera Drone 4K Foldable", category: "Gadgets>Drones", brand: "Local Premium", price: 24500, compareAt: 29900, icon: "plane", base: "electronics" },
  { name: "Mini Selfie Drone", category: "Gadgets>Drones", brand: "Xiaomi", price: 8900, icon: "plane", base: "electronics" },
  { name: "Sports Action Camera 4K", category: "Gadgets>Action Cameras", brand: "Sony", price: 18500, compareAt: 22000, icon: "video", base: "electronics" },

  // Men
  { name: "Men's Classic Oxford Shirt", category: "Men>Shirts", brand: "H&M", price: 1450, compareAt: 1950, icon: "shirt", base: "fashion", colors: ["White", "Sky Blue", "Navy"], sizes: ["S", "M", "L", "XL", "XXL"], specs: [["Fabric", "Cotton Blend"], ["Fit", "Regular"]] },
  { name: "Men's Casual Linen Shirt", category: "Men>Shirts", brand: "Zara", price: 1650, icon: "shirt", base: "fashion", colors: ["Beige", "Olive", "White"], sizes: ["S", "M", "L", "XL"] },
  { name: "Men's Flannel Check Shirt", category: "Men>Shirts", brand: "Levi's", price: 1850, compareAt: 2400, icon: "shirt", base: "fashion", colors: ["Red Check", "Blue Check"], sizes: ["M", "L", "XL"] },
  { name: "Premium Polo T-Shirt", category: "Men>T-Shirts", brand: "Adidas", price: 1250, compareAt: 1750, icon: "shirt", base: "fashion", colors: ["Black", "Navy", "White"], sizes: ["M", "L", "XL", "XXL"] },
  { name: "Men's Heavyweight Oversized Tee", category: "Men>T-Shirts", brand: "Imalissa Signature", price: 990, compareAt: 1400, icon: "shirt", base: "fashion", colors: ["Black", "Stone", "Charcoal"], sizes: ["M", "L", "XL"] },
  { name: "Graphic Print T-Shirt", category: "Men>T-Shirts", brand: "H&M", price: 850, icon: "shirt", base: "fashion", colors: ["Black", "White"], sizes: ["S", "M", "L", "XL"] },
  { name: "Men's Slim Fit Chinos", category: "Men>Pants", brand: "Zara", price: 1950, compareAt: 2600, icon: "ruler", base: "fashion", colors: ["Khaki", "Navy", "Black"], sizes: ["30", "32", "34", "36"] },
  { name: "Men's Denim Jeans Regular", category: "Men>Pants", brand: "Levi's", price: 2750, compareAt: 3500, icon: "ruler", base: "fashion", colors: ["Dark Blue", "Mid Blue"], sizes: ["30", "32", "34", "36", "38"] },
  { name: "Men's Cargo Pants Relaxed", category: "Men>Pants", brand: "Local Premium", price: 1650, icon: "ruler", base: "fashion", colors: ["Olive", "Black"], sizes: ["30", "32", "34", "36"] },
  { name: "Waterproof Windbreaker Jacket", category: "Men>Jackets", brand: "Adidas", price: 3250, compareAt: 4500, icon: "shield", base: "fashion", colors: ["Black", "Grey"], sizes: ["M", "L", "XL"] },
  { name: "Men's Denim Jacket Classic", category: "Men>Jackets", brand: "Levi's", price: 3850, icon: "shield", base: "fashion", colors: ["Mid Blue"], sizes: ["M", "L", "XL"] },
  { name: "Leather Formal Shoes", category: "Men>Footwear", brand: "Apex", price: 2950, compareAt: 3900, icon: "footprints", base: "fashion", colors: ["Black", "Brown"], sizes: ["40", "41", "42", "43", "44"] },
  { name: "Men's Running Sneakers", category: "Men>Footwear", brand: "Nike", price: 4750, compareAt: 6200, icon: "footprints", base: "fashion", colors: ["White/Black", "Grey"], sizes: ["40", "41", "42", "43"] },
  { name: "Casual Canvas Shoes", category: "Men>Footwear", brand: "Bata", price: 1250, icon: "footprints", base: "fashion", colors: ["Black", "Navy"], sizes: ["40", "41", "42", "43", "44"] },
  { name: "Men's Chronograph Watch Steel", category: "Men>Watches", brand: "Fossil", price: 8500, compareAt: 11000, icon: "watch", base: "fashion", colors: ["Silver", "Black"] },
  { name: "Men's Casual Quartz Watch", category: "Men>Watches", brand: "Casio", price: 3450, icon: "watch", base: "fashion", colors: ["Silver", "Gold"] },

  // Women
  { name: "Women's Embroidered Kurti", category: "Women>Kurtis & Tunics", brand: "Local Premium", price: 1250, compareAt: 1750, icon: "sparkles", base: "fashion", colors: ["Maroon", "Teal", "Mustard"], sizes: ["S", "M", "L", "XL"] },
  { name: "Printed Cotton Kurti", category: "Women>Kurtis & Tunics", brand: "H&M", price: 950, icon: "sparkles", base: "fashion", colors: ["Blue", "Pink", "Green"], sizes: ["S", "M", "L"] },
  { name: "Designer Anarkali Kurti", category: "Women>Kurtis & Tunics", brand: "Imalissa Signature", price: 2150, compareAt: 2900, icon: "sparkles", base: "fashion", colors: ["Royal Blue", "Wine"], sizes: ["M", "L", "XL"] },
  { name: "Women's Summer Midi Dress", category: "Women>Dresses", brand: "Zara", price: 1950, compareAt: 2700, icon: "sparkles", base: "fashion", colors: ["Black", "Floral"], sizes: ["S", "M", "L"] },
  { name: "Evening Party Dress", category: "Women>Dresses", brand: "Zara", price: 3450, icon: "sparkles", base: "fashion", colors: ["Red", "Black"], sizes: ["S", "M", "L"] },
  { name: "Casual Denim Dress", category: "Women>Dresses", brand: "H&M", price: 2250, icon: "sparkles", base: "fashion", colors: ["Blue"], sizes: ["S", "M", "L", "XL"] },
  { name: "Banarasi Silk Saree", category: "Women>Sarees", brand: "Imalissa Signature", price: 5750, compareAt: 7500, icon: "sparkles", base: "fashion", colors: ["Red", "Green", "Golden"] },
  { name: "Cotton Handloom Saree", category: "Women>Sarees", brand: "Local Premium", price: 2450, icon: "sparkles", base: "fashion", colors: ["White-Red", "Blue"] },
  { name: "Women's Leather Handbag", category: "Women>Bags & Handbags", brand: "Zara", price: 2750, compareAt: 3600, icon: "shopping-bag", base: "fashion", colors: ["Tan", "Black", "Burgundy"] },
  { name: "Everyday Tote Bag", category: "Women>Bags & Handbags", brand: "H&M", price: 1450, icon: "shopping-bag", base: "fashion", colors: ["Black", "Beige"] },
  { name: "Crossbody Sling Bag", category: "Women>Bags & Handbags", brand: "Local Premium", price: 950, compareAt: 1300, icon: "shopping-bag", base: "fashion", colors: ["Black", "Brown"] },
  { name: "Gold-Plated Necklace Set", category: "Women>Jewellery", brand: "Imalissa Signature", price: 1750, compareAt: 2500, icon: "gem", base: "beauty", colors: ["Gold", "Rose Gold"] },
  { name: "Stud Earring Collection", category: "Women>Jewellery", brand: "Local Premium", price: 650, icon: "gem", base: "beauty" },
  { name: "Heeled Sandals", category: "Women>Footwear", brand: "Apex", price: 1850, compareAt: 2400, icon: "footprints", base: "fashion", colors: ["Nude", "Black"], sizes: ["36", "37", "38", "39", "40"] },
  { name: "Women's Running Sneakers", category: "Women>Footwear", brand: "Nike", price: 5250, icon: "footprints", base: "fashion", colors: ["White", "Pink"], sizes: ["36", "37", "38", "39"] },

  // Boys
  { name: "Boys' Cotton T-Shirt Pack", category: "Boys>T-Shirts", brand: "H&M", price: 750, compareAt: 990, icon: "shirt", base: "kids", colors: ["Blue", "Red"], sizes: ["2-3Y", "4-5Y", "6-7Y", "8-9Y"] },
  { name: "Boys' Printed Tee", category: "Boys>T-Shirts", brand: "Local Premium", price: 450, icon: "shirt", base: "kids", colors: ["Yellow", "Green"], sizes: ["3-4Y", "5-6Y", "7-8Y"] },
  { name: "Boys' Formal Shirt", category: "Boys>Shirts", brand: "H&M", price: 850, compareAt: 1150, icon: "shirt", base: "kids", colors: ["White", "Powder Blue"], sizes: ["4-5Y", "6-7Y", "8-9Y", "10-11Y"] },
  { name: "Boys' Denim Shorts", category: "Boys>Shorts & Pants", brand: "Levi's", price: 950, icon: "ruler", base: "kids", colors: ["Blue"], sizes: ["4-5Y", "6-7Y", "8-9Y"] },
  { name: "Boys' Jogger Pants", category: "Boys>Shorts & Pants", brand: "Adidas", price: 1150, compareAt: 1500, icon: "ruler", base: "kids", colors: ["Black", "Grey"], sizes: ["5-6Y", "7-8Y", "9-10Y"] },
  { name: "Boys' Panjabi Festive", category: "Boys>Ethnic Wear", brand: "Imalissa Signature", price: 1450, compareAt: 1950, icon: "sparkles", base: "kids", colors: ["Ivory", "Sky"], sizes: ["2-3Y", "4-5Y", "6-7Y", "8-9Y"] },

  // Girls
  { name: "Girls' Frock Floral Print", category: "Girls>Frocks & Dresses", brand: "H&M", price: 950, compareAt: 1350, icon: "sparkles", base: "kids", colors: ["Pink", "Mint"], sizes: ["2-3Y", "4-5Y", "6-7Y"] },
  { name: "Girls' Party Dress", category: "Girls>Frocks & Dresses", brand: "Imalissa Signature", price: 1650, icon: "sparkles", base: "kids", colors: ["Red", "Gold"], sizes: ["3-4Y", "5-6Y", "7-8Y"] },
  { name: "Girls' Cotton Top", category: "Girls>Tops", brand: "H&M", price: 550, compareAt: 750, icon: "shirt", base: "kids", colors: ["White", "Peach"], sizes: ["4-5Y", "6-7Y", "8-9Y"] },
  { name: "Girls' Ethnic Sharara Set", category: "Girls>Ethnic Wear", brand: "Imalissa Signature", price: 1850, compareAt: 2400, icon: "sparkles", base: "kids", colors: ["Teal", "Pink"], sizes: ["3-4Y", "5-6Y", "7-8Y"] },
  { name: "Girls' Hair Clip Set", category: "Girls>Hair Accessories", brand: "Local Premium", price: 250, icon: "gem", base: "beauty", colors: ["Multi"] },

  // Baby
  { name: "Baby Cotton Onesie 3-Pack", category: "Baby>Baby Clothing", brand: "H&M", price: 850, compareAt: 1100, icon: "baby", base: "kids", sizes: ["0-3M", "3-6M", "6-9M"] },
  { name: "Baby Winter Fleece Suit", category: "Baby>Baby Clothing", brand: "Local Premium", price: 1150, icon: "baby", base: "kids", colors: ["Grey", "Pink"], sizes: ["6-12M", "12-18M"] },
  { name: "Anti-Colic Feeding Bottle 250ml", category: "Baby>Feeding", brand: "Local Premium", price: 450, compareAt: 600, icon: "milk", base: "kids" },
  { name: "Baby Feeding Bottle Set", category: "Baby>Feeding", brand: "Beautiful", price: 750, icon: "milk", base: "kids" },
  { name: "Baby Diapers Jumbo Pack", category: "Baby>Diapering", brand: "Beautiful", price: 1650, compareAt: 1950, icon: "package", base: "kids", sizes: ["M", "L", "XL"] },
  { name: "Soft Baby Play Mat", category: "Baby>Toys", brand: "Beautiful", price: 1250, icon: "puzzle", base: "kids" },
  { name: "Wooden Stacking Toy", category: "Baby>Toys", brand: "Local Premium", price: 650, compareAt: 850, icon: "puzzle", base: "kids" },

  // Fashion (generic)
  { name: "Polarized Sunglasses", category: "Fashion>Sunglasses", brand: "Local Premium", price: 750, compareAt: 1100, icon: "glasses", base: "fashion", colors: ["Black", "Brown"] },
  { name: "Designer Sunglasses UV400", category: "Fashion>Sunglasses", brand: "Gucci", price: 3450, icon: "glasses", base: "fashion", colors: ["Gold Frame"] },
  { name: "Men's Baseball Cap", category: "Fashion>Caps & Hats", brand: "Adidas", price: 650, compareAt: 900, icon: "crown", base: "fashion", colors: ["Black", "Navy"] },
  { name: "Wide-Brim Sun Hat", category: "Fashion>Caps & Hats", brand: "H&M", price: 850, icon: "crown", base: "fashion", colors: ["Beige"] },
  { name: "Reversible Leather Belt", category: "Fashion>Belts", brand: "Woodland", price: 950, compareAt: 1300, icon: "ruler", base: "fashion", colors: ["Black-Brown"], sizes: ["32", "34", "36", "38"] },
  { name: "Printed Chiffon Scarf", category: "Fashion>Scarves", brand: "Local Premium", price: 550, icon: "wind", base: "fashion", colors: ["Maroon", "Teal"] },

  // Beauty
  { name: "Vitamin C Face Serum 30ml", category: "Beauty>Skincare", brand: "Lakme", price: 850, compareAt: 1100, icon: "flower-2", base: "beauty" },
  { name: "Hydrating Moisturizer 100g", category: "Beauty>Skincare", brand: "Nivea", price: 550, icon: "flower-2", base: "beauty" },
  { name: "Sunscreen SPF 50 PA+++", category: "Beauty>Skincare", brand: "Nivea", price: 650, compareAt: 850, icon: "flower-2", base: "beauty" },
  { name: "Matte Lipstick Set", category: "Beauty>Makeup", brand: "Maybelline", price: 1150, compareAt: 1500, icon: "sparkles", base: "beauty", colors: ["Reds", "Nudes"] },
  { name: "Compact Powder", category: "Beauty>Makeup", brand: "Maybelline", price: 750, icon: "sparkles", base: "beauty" },
  { name: "Eau de Parfum 100ml", category: "Beauty>Fragrance", brand: "Rich", price: 1850, compareAt: 2500, icon: "wind", base: "beauty" },
  { name: "Attar Oud Premium 12ml", category: "Beauty>Fragrance", brand: "Imalissa Signature", price: 950, icon: "wind", base: "beauty" },
  { name: "Argan Oil Hair Treatment", category: "Beauty>Hair Care", brand: "The Body Shop", price: 1250, compareAt: 1600, icon: "scissors", base: "beauty" },
  { name: "Anti-Dandruff Shampoo 400ml", category: "Beauty>Hair Care", brand: "Nivea", price: 550, icon: "scissors", base: "beauty" },

  // Home & Lifestyle
  { name: "Ceramic Table Lamp Warm Light", category: "Home & Lifestyle>Home Décor", brand: "Beautiful", price: 1650, compareAt: 2200, icon: "lamp", base: "home" },
  { name: "LED String Fairy Lights 10m", category: "Home & Lifestyle>Home Décor", brand: "Walton", price: 350, compareAt: 500, icon: "lamp", base: "home" },
  { name: "Wall Clock Minimal Design", category: "Home & Lifestyle>Home Décor", brand: "Beautiful", price: 850, icon: "clock", base: "home" },
  { name: "Non-Stick Cookware Set 5pc", category: "Home & Lifestyle>Kitchen", brand: "Beautiful", price: 3450, compareAt: 4500, icon: "utensils", base: "home" },
  { name: "Electric Kettle 1.7L", category: "Home & Lifestyle>Kitchen", brand: "Walton", price: 1450, compareAt: 1900, icon: "utensils", base: "home" },
  { name: "Blender 600W with Jar", category: "Home & Lifestyle>Kitchen", brand: "Walton", price: 2750, icon: "utensils", base: "home" },
  { name: "Cotton Bedsheet with 2 Pillow Covers", category: "Home & Lifestyle>Bedding", brand: "Local Premium", price: 1450, compareAt: 1950, icon: "bed", base: "home", colors: ["Teal", "Maroon", "Grey"], sizes: ["Single", "Double"] },
  { name: "Memory Foam Pillow Pair", category: "Home & Lifestyle>Bedding", brand: "Beautiful", price: 1250, icon: "bed", base: "home" },
  { name: "Vacuum Storage Bags 6pc", category: "Home & Lifestyle>Storage", brand: "Local Premium", price: 550, compareAt: 750, icon: "package", base: "home" },
  { name: "Storage Organizer Box Large", category: "Home & Lifestyle>Storage", brand: "Beautiful", price: 450, icon: "package", base: "home" },
  { name: "Rechargeable Fan 16\"", category: "Home & Lifestyle>Air & Climate", brand: "Walton", price: 2450, compareAt: 3100, icon: "fan", base: "home" },
  { name: "Air Cooler 20L Personal", category: "Home & Lifestyle>Air & Climate", brand: "Walton", price: 7850, compareAt: 9200, icon: "fan", base: "home" },

  // Accessories
  { name: "Genuine Leather Wallet", category: "Accessories>Wallets", brand: "Woodland", price: 1150, compareAt: 1500, icon: "wallet", base: "fashion", colors: ["Brown", "Black"] },
  { name: "RFID Card Holder Slim", category: "Accessories>Wallets", brand: "Local Premium", price: 750, icon: "wallet", base: "fashion", colors: ["Grey", "Navy"] },
  { name: "Stainless Steel Watch", category: "Accessories>Watches", brand: "Titan", price: 3750, compareAt: 4800, icon: "watch", base: "fashion", colors: ["Silver", "Black"] },
  { name: "Minimalist Watch Leather Strap", category: "Accessories>Watches", brand: "Fossil", price: 5450, icon: "watch", base: "fashion", colors: ["Tan", "Black"] },
  { name: "Silver Toe Ring Set", category: "Accessories>Rings & Jewellery", brand: "Local Premium", price: 350, icon: "gem", base: "beauty" },
  { name: "Couple Band Ring Set", category: "Accessories>Rings & Jewellery", brand: "Imalissa Signature", price: 1250, compareAt: 1700, icon: "gem", base: "beauty", colors: ["Silver", "Gold"] },
  { name: "Silicone Phone Case", category: "Accessories>Phone Accessories", brand: "Xiaomi", price: 350, compareAt: 500, icon: "smartphone", base: "electronics", colors: ["Black", "Clear"] },
  { name: "Tempered Glass 2 Pack", category: "Accessories>Phone Accessories", brand: "Local Premium", price: 250, icon: "smartphone", base: "electronics" },

  // Sports
  { name: "Adjustable Dumbbell Set 20kg", category: "Sports>Fitness", brand: "Adidas", price: 4750, compareAt: 6200, icon: "dumbbell", base: "sports" },
  { name: "Yoga Mat 6mm Anti-Slip", category: "Sports>Fitness", brand: "Adidas", price: 950, compareAt: 1300, icon: "dumbbell", base: "sports", colors: ["Black", "Purple", "Teal"] },
  { name: "Resistance Bands Set", category: "Sports>Fitness", brand: "Local Premium", price: 550, icon: "dumbbell", base: "sports" },
  { name: "English Willow Cricket Bat", category: "Sports>Cricket", brand: "Local Premium", price: 5750, compareAt: 7500, icon: "trophy", base: "sports" },
  { name: "Tennis Cricket Ball (6 Pack)", category: "Sports>Cricket", brand: "Local Premium", price: 450, icon: "trophy", base: "sports" },
  { name: "Helmet with Visor", category: "Sports>Cricket", brand: "Local Premium", price: 1450, compareAt: 1900, icon: "shield", base: "sports" },
  { name: "Mountain Cycle 21-Speed", category: "Sports>Cycling", brand: "Local Premium", price: 18500, compareAt: 22000, icon: "bike", base: "sports" },
  { name: "Cycling Helmet", category: "Sports>Cycling", brand: "Adidas", price: 1650, icon: "shield", base: "sports", colors: ["Black", "White"] },
];

const DESCRIPTIONS: Record<string, string> = {
  electronics:
    "Experience premium performance engineered for everyday life. Built with high-quality components, tested for durability and backed by Imalissa's authenticity guarantee.",
  fashion:
    "Elevate your wardrobe with premium fabric, refined tailoring and a comfort-first fit. Designed to look sharp from morning meetings to evening outings.",
  beauty:
    "Salon-quality care for your daily routine. Dermatologically tested formulas that are gentle on skin and effective in results.",
  home:
    "Thoughtfully designed for modern living — durable materials, elegant finish and everyday practicality for a home you love.",
  kids:
    "Soft, safe and made to move — gentle fabrics and playful designs that keep up with little ones all day long.",
  sports:
    "Performance-grade gear built for training, play and everything in between. Grip, durability and comfort you can rely on.",
};

async function seedCategories() {
  console.log("→ Categories…");
  await prisma.category.deleteMany();

  let topPos = 0;
  for (const top of CATEGORY_TREE) {
    const topRow = await prisma.category.create({
      data: {
        name: top.name,
        slug: slugify(top.name),
        icon: top.icon,
        image: await writeSvg("categories", slugify(top.name), await productSvg({
          title: top.name,
          brand: "Imalissa",
          icon: top.icon,
          variant: topPos % 3,
        })),
        position: topPos++,
        description: top.seo ?? `${top.name} at Imalissa — 100% authentic products with Cash on Delivery across Bangladesh.`,
        seoTitle: top.seo ?? undefined,
        seoDescription: top.seo ?? `Shop ${top.name} online in Bangladesh at Imalissa — authentic products, fast delivery, cash on delivery.`,
      },
    });

    let childPos = 0;
    for (const child of top.children ?? []) {
      await prisma.category.create({
        data: {
          name: child.name,
          slug: `${slugify(top.name)}-${slugify(child.name)}`,
          parentId: topRow.id,
          icon: child.icon ?? top.icon,
          position: childPos++,
          description: `${child.name} — explore the collection at Imalissa.`,
        },
      });
    }
  }
}

async function seedBrands() {
  console.log("→ Brands…");
  await prisma.brand.deleteMany();
  for (const name of BRANDS) {
    await prisma.brand.create({ data: { name, slug: slugify(name) } });
  }
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function seedProducts() {
  console.log("→ Products…");
  await prisma.product.deleteMany();

  const categories = await prisma.category.findMany();
  const catByPath = new Map<string, string>();
  const topCatBySlug = new Map<string, { id: string; name: string }>();
  for (const c of categories) {
    if (!c.parentId) topCatBySlug.set(c.slug, { id: c.id, name: c.name });
  }
  // Map "Top>Child" and top-level directly.
  for (const c of categories) {
    if (c.parentId) {
      const parent = categories.find((p) => p.id === c.parentId)!;
      catByPath.set(`${parent.name}>${c.name}`, c.id);
    } else {
      catByPath.set(c.name, c.id);
    }
  }

  const brands = await prisma.brand.findMany();
  const brandId = (name?: string) =>
    brands.find((b) => b.name === (name ?? ""))?.id ?? null;

  const featuredSet = new Set<number>();
  const bestsellerSet = new Set<number>();
  const dealSet = new Set<number>();
  PRODUCTS.forEach((_, i) => {
    if (i % 5 === 0) featuredSet.add(i);
    if (i % 7 === 2) bestsellerSet.add(i);
    if (i % 6 === 3) dealSet.add(i);
  });

  let idx = 0;
  for (const t of PRODUCTS) {
    const categoryId = catByPath.get(t.category);
    if (!categoryId) {
      console.warn(`  ! category not found: ${t.category}`);
      continue;
    }

    const discount = t.compareAt
      ? Math.round(((t.compareAt - t.price) / t.compareAt) * 100)
      : idx % 4 === 0 ? 10 : 0;
    const price = t.price;
    const compareAt = t.compareAt ?? (discount > 0 ? Math.round(price / (1 - discount / 100)) : null);

    const slug = slugify(t.name);
    const stock = t.base === "fashion" || t.base === "kids" ? 12 + (idx % 40) : 5 + (idx % 30);
    const sold = (idx * 13) % 480;
    const rating = Math.round((3.7 + ((idx * 7) % 13) / 10) * 10) / 10;
    const ratingCount = (idx * 3) % 60;
    const topCat = t.category.split(">")[0];
    const topSlug = slugify(topCat);
    const categoryIcon =
      CATEGORY_TREE.find((c) => c.name === topCat)?.icon ?? "package";

    const images: string[] = [];
    for (let v = 0; v < 3; v++) {
      images.push(
        await writeSvg(
          "products",
          `${slug}-${v + 1}`,
          await productSvg({
            title: t.name,
            brand: t.brand ?? "Imalissa",
            icon: t.icon || categoryIcon,
            variant: v,
          })
        )
      );
    }

    const description =
      t.description ??
      `${DESCRIPTIONS[t.base]}\n\n${t.name} from ${t.brand ?? "Imalissa"} — available now at Imalissa with Cash on Delivery and fast nationwide shipping.`;

    const specs: [string, string][] = [
      ["Brand", t.brand ?? "Imalissa"],
      ["SKU", `IM-${String(idx + 1).padStart(5, "0")}`],
      ...(t.specs ?? []),
      ["Warranty", t.base === "electronics" ? "1 Year Replacement" : "No Warranty"],
      ["Delivery", "2–5 days across Bangladesh"],
    ];

    const product = await prisma.product.create({
      data: {
        name: t.name,
        slug,
        sku: `IM-${String(idx + 1).padStart(5, "0")}`,
        shortDescription: t.name,
        description,
        brandId: brandId(t.brand),
        categoryId,
        price: D(price),
        compareAtPrice: compareAt ? D(compareAt) : null,
        discountPercent: compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : discount,
        stock,
        isFeatured: featuredSet.has(idx),
        isBestseller: bestsellerSet.has(idx),
        newArrival: idx % 9 === 1,
        isDeal: dealSet.has(idx),
        rating: Math.min(5, rating),
        ratingCount,
        reviewCount: ratingCount,
        soldCount: sold,
        colors: t.colors ? JSON.stringify(t.colors) : null,
        sizes: t.sizes ? JSON.stringify(t.sizes) : null,
        specifications: specs as unknown as Prisma.InputJsonValue,
        shippingInfo:
          "Free delivery on orders over ৳3,000. Standard delivery 2–5 working days across Bangladesh.",
        returnInfo:
          "Easy 7-day return policy. Items must be unused with original tags and packaging.",
        seoTitle: `${t.name}${t.brand ? ` — ${t.brand}` : ""} | Imalissa`,
        seoDescription: `Buy ${t.name} online at Imalissa, Bangladesh. ${compareAt && compareAt > price ? `Save ${Math.round(((compareAt - price) / compareAt) * 100)}% — ` : ""}Cash on Delivery available.`,
        images: {
          create: images.map((url, i) => ({ url, position: i, alt: `${t.name} — view ${i + 1}` })),
        },
      },
    });

    // Variants when colors/sizes exist.
    if (t.colors?.length || t.sizes?.length) {
      const colors = t.colors?.length ? [null, ...t.colors] : [null];
      const sizes = t.sizes?.length ? [null, ...t.sizes] : [null];
      let vPos = 0;
      for (const c of colors) {
        for (const s of sizes) {
          if (!c && !s) continue; // base row handled by product stock
          if (c && s && t.colors?.length && t.sizes?.length) {
            // keep full matrix but cap rows
            if (vPos > 24) continue;
          }
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: `${product.sku}-${vPos + 1}${c ? `-${c.replace(/\s+/g, "").slice(0, 6)}` : ""}${s ? `-${s.replace(/\s+/g, "")}` : ""}`,
              color: c,
              size: s,
              stock: 4 + ((idx + vPos) % 20),
              position: vPos++,
            },
          });
        }
      }
    }

    idx++;
  }
  console.log(`  ${idx} products seeded`);
}

async function seedBanners() {
  console.log("→ Banners & homepage sections…");
  await prisma.banner.deleteMany();
  await prisma.homeSection.deleteMany();

  const heroBanners = [
    {
      title: "The Premium Sale",
      subtitle: "Up to 40% off on electronics, fashion & lifestyle",
      icon: "zap",
      link: "/search?sort=discount",
    },
    {
      title: "New Season New Style",
      subtitle: "Fresh arrivals for men, women & kids",
      icon: "sparkles",
      link: "/search?sort=newest",
    },
    {
      title: "Home of Authentic Brands",
      subtitle: "100% genuine products with Cash on Delivery",
      icon: "shield-check",
      link: "/search",
    },
  ];

  let i = 0;
  for (const b of heroBanners) {
    await prisma.banner.create({
      data: {
        title: b.title,
        subtitle: b.subtitle,
        image: await writeSvg(
          "banners",
          `hero-${i + 1}`,
          await bannerSvg({
            kicker: "Imalissa presents",
            title: b.title,
            subtitle: b.subtitle,
            icon: b.icon,
            wide: true,
            tone: i % 3,
          })
        ),
        mobileImage: null,
        link: b.link,
        buttonText: "Shop Now",
        position: "HERO",
        positionIndex: i++,
      },
    });
  }

  const promos = [
    { title: "Electronics Deals", subtitle: "Gadgets that wow", icon: "headphones", link: `/c/${slugify("Electronics")}` },
    { title: "Men's Edit", subtitle: "Sharp fits, fair prices", icon: "shirt", link: `/c/${slugify("Men")}` },
    { title: "Women's Collection", subtitle: "Elegance, delivered", icon: "sparkles", link: `/c/${slugify("Women")}` },
    { title: "Home Refresh", subtitle: "Comfort in every corner", icon: "lamp", link: `/c/${slugify("Home & Lifestyle")}` },
  ];
  i = 0;
  for (const p of promos) {
    await prisma.banner.create({
      data: {
        title: p.title,
        subtitle: p.subtitle,
        image: await writeSvg(
          "banners",
          `promo-${i + 1}`,
          await bannerSvg({
            kicker: "Collection",
            title: p.title,
            subtitle: p.subtitle,
            icon: p.icon,
            tone: i % 3,
          })
        ),
        link: p.link,
        buttonText: "Explore",
        position: "PROMO",
        positionIndex: i++,
      },
    });
  }

  const sections: [string, string, string, string, number, boolean][] = [
    ["hero_categories", "Shop by Category", "Browse our most popular departments", "CATEGORY_GRID", 0, true],
    ["trending", "Trending Now", "What everyone is buying this week", "PRODUCT_GRID", 10, true],
    ["new_arrivals", "New Arrivals", "Fresh drops added daily", "PRODUCT_GRID", 20, true],
    ["bestsellers", "Best Sellers", "Customer favorites, tried and trusted", "PRODUCT_GRID", 30, true],
    ["promo_banners", "Curated Collections", "Handpicked edits for every taste", "BANNER_GRID", 40, true],
    ["deals", "Special Offers", "Limited-time deals — grab them fast", "PRODUCT_GRID", 50, true],
    ["electronics", "Electronics & Gadgets", "Tech that upgrades your day", "PRODUCT_GRID", 60, true],
    ["men", "Men's Collection", "Refined essentials for every day", "PRODUCT_GRID", 70, true],
    ["women", "Women's Collection", "Elegance from head to toe", "PRODUCT_GRID", 80, true],
    ["kids_baby", "Kids & Baby", "Little styles, big smiles", "PRODUCT_GRID", 90, true],
    ["home", "Home & Lifestyle", "Make every corner beautiful", "PRODUCT_GRID", 100, true],
    ["recommended", "Recommended for You", "Picked based on what's popular", "PRODUCT_GRID", 110, true],
    ["recently_viewed", "Recently Viewed", "Continue where you left off", "TEXT_ONLY", 120, true],
  ];

  for (const [key, title, subtitle, type, order, visible] of sections) {
    await prisma.homeSection.create({
      data: {
        key,
        title,
        subtitle,
        type: type as never,
        source: key === "recommended" ? "featured" : key,
        order,
        isVisible: visible,
        link: key === "hero_categories" || key === "promo_banners" ? "/search" : undefined,
        buttonText: key === "promo_banners" ? "View all collections" : undefined,
      },
    });
  }
}

async function seedSettings() {
  console.log("→ Settings…");
  const { DEFAULT_SETTINGS } = await import("../src/lib/settings");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: value as object, group: key },
      create: { key, value: value as object, group: key },
    });
  }
}

async function seedAdmin() {
  console.log("→ Admin account…");
  const email = process.env.ADMIN_EMAIL || "admin@imalissa.com";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe!2026";
  const name = process.env.ADMIN_NAME || "Imalissa Admin";

  await prisma.adminUser.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      passwordHash: hashSync(password, 12),
      role: "SUPER_ADMIN",
    },
  });
  console.log(`  admin: ${email}`);
}

async function seedCustomersAndReviews() {
  console.log("→ Customers, coupons, reviews…");

  const customers = [
    { name: "Rahim Uddin", email: "rahim@example.com", phone: "01711000001" },
    { name: "Fatema Akter", email: "fatema@example.com", phone: "01711000002" },
    { name: "Sabbir Ahmed", email: "sabbir@example.com", phone: "01711000003" },
  ];
  const users = [];
  for (const c of customers) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        passwordHash: hashSync("Customer!2026", 12),
      },
    });
    users.push(user);
    await prisma.address.upsert({
      where: { id: `seed-addr-${user.id}` },
      update: {},
      create: {
        id: `seed-addr-${user.id}`,
        userId: user.id,
        fullName: c.name,
        phone: c.phone,
        email: c.email,
        division: "Dhaka",
        district: "Dhaka",
        area: "Dhanmondi",
        fullAddress: `House 12, Road 5, Dhanmondi, Dhaka`,
        isDefault: true,
      },
    }).catch(() => undefined);
  }

  // Coupons
  await prisma.coupon.upsert({ where: { code: "WELCOME10" }, update: {}, create: {
    code: "WELCOME10", type: "PERCENTAGE", value: D(10), minOrder: D(1000), maxDiscount: D(500),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), usageLimit: 1000, perUserLimit: 3,
    description: "10% off your first order (max ৳500)",
  }});
  await prisma.coupon.upsert({ where: { code: "FREESHIP" }, update: {}, create: {
    code: "FREESHIP", type: "FIXED", value: D(80), minOrder: D(1500),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180), usageLimit: 500, perUserLimit: 5,
    description: "৳80 off — treat it as free delivery",
  }});
  await prisma.coupon.upsert({ where: { code: "IMAL20" }, update: {}, create: {
    code: "IMAL20", type: "PERCENTAGE", value: D(20), minOrder: D(5000), maxDiscount: D(2000),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60), usageLimit: 200, perUserLimit: 1,
    description: "20% off orders over ৳5,000 (max ৳2,000)",
  }});

  // Reviews on a rotating subset of products
  const products = await prisma.product.findMany({ take: 60, orderBy: { createdAt: "asc" } });
  const reviewTexts = [
    ["Excellent quality", "Really impressed with the build quality. Delivery was fast and packaging was neat.", 5],
    ["Worth the price", "Exactly as described. Cash on delivery made it easy to trust.", 5],
    ["Good product", "Works well for daily use. Slight delay in delivery but overall happy.", 4],
    ["Satisfied purchase", "Authentic product and nicely packed. Recommended.", 5],
    ["Better than expected", "The finish looks premium. My second purchase from Imalissa.", 5],
    ["Decent value", "Product is fine for the price. Would like more color options.", 4],
  ] as [string, string, number][];

  let r = 0;
  for (const p of products) {
    if (r >= 110) break;
    const reviewer = users[r % users.length];
    if (!reviewer) break;
    const [title, comment, rating] = reviewTexts[r % reviewTexts.length];
    await prisma.review.upsert({
      where: { productId_userId: { productId: p.id, userId: reviewer.id } },
      update: {},
      create: {
        productId: p.id,
        userId: reviewer.id,
        rating,
        title,
        comment,
        status: r % 6 === 5 ? "PENDING" : "APPROVED",
        isVerified: r % 3 !== 2,
      },
    });
    r++;
  }
  console.log(`  ${r} reviews seeded`);
}

async function main() {
  console.log("Seeding Imalissa…");
  ensureDirs();
  await seedAdmin();
  await seedSettings();
  await seedCategories();
  await seedBrands();
  await seedProducts();
  await seedBanners();
  await seedCustomersAndReviews();
  console.log("Done ✓");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
