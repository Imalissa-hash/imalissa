"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import {
  Panel,
  Field,
  TextInput,
  TextArea,
  Select,
  Checkbox,
  BusyBtn,
  Btn,
  Table,
  Th,
  Td,
} from "@/components/admin/ui";
import { formatBDT, salePrice, slugify } from "@/lib/utils";
import { CategoryPicker } from "./CategoryPicker";

export interface Option {
  id: string;
  name: string;
}

export interface CategoryOption extends Option {
  depth: number;
}

export interface FormImage {
  id?: string;
  url: string;
  alt: string | null;
}

export interface FormVariant {
  id?: string;
  sku: string;
  color: string;
  size: string;
  price: string;
  stock: string;
}

/** Server-serialized product passed to edit mode (Decimals → numbers). */
export interface InitialProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brandId: string | null;
  categoryId: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  stock: number;
  lowStockThreshold: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  shortDescription: string | null;
  description: string | null;
  colors: string[];
  sizes: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: FormImage[];
  variants: FormVariant[];
}

/** Mirrors prisma enum ProductStatus (kept as literals so no Prisma runtime
 *  is bundled into the client). */
const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

interface FormState {
  name: string;
  slug: string;
  sku: string;
  brandId: string;
  categoryId: string;
  price: string;
  compareAtPrice: string;
  discountPercent: string;
  stock: string;
  lowStockThreshold: string;
  status: string;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  shortDescription: string;
  description: string;
  colors: string;
  sizes: string;
  seoTitle: string;
  seoDescription: string;
}

function makeInitial(p?: InitialProduct): FormState {
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    sku: p?.sku ?? "",
    brandId: p?.brandId ?? "",
    categoryId: p?.categoryId ?? "",
    price: p ? String(p.price) : "",
    compareAtPrice: p?.compareAtPrice != null ? String(p.compareAtPrice) : "",
    discountPercent: p ? String(p.discountPercent) : "0",
    stock: p ? String(p.stock) : "0",
    lowStockThreshold: p ? String(p.lowStockThreshold) : "5",
    status: p?.status ?? "ACTIVE",
    isFeatured: p?.isFeatured ?? false,
    isBestseller: p?.isBestseller ?? false,
    newArrival: p?.newArrival ?? false,
    isDeal: p?.isDeal ?? false,
    shortDescription: p?.shortDescription ?? "",
    description: p?.description ?? "",
    colors: p ? p.colors.join(", ") : "",
    sizes: p ? p.sizes.join(", ") : "",
    seoTitle: p?.seoTitle ?? "",
    seoDescription: p?.seoDescription ?? "",
  };
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Shared create/edit product form. */
export function ProductForm({
  mode,
  initial,
  brands,
  categories,
}: {
  mode: "create" | "edit";
  initial?: InitialProduct;
  brands: Option[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState<FormState>(() => makeInitial(initial));
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [images, setImages] = useState<FormImage[]>(initial?.images ?? []);
  const [variants, setVariants] = useState<FormVariant[]>(initial?.variants ?? []);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // Live sale-price preview.
  const priceNum = Number(f.price) || 0;
  const discountNum = Number(f.discountPercent || 0) || 0;
  const showSale = priceNum > 0 && discountNum > 0;

  // ── Image upload ──────────────────────────────────────────
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || uploading) return;
    setUploading(true);
    setImageError(null);
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload?dir=products", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({ ok: false }));
        if (json.ok && json.data?.url) {
          const url: string = json.data.url;
          setImages((prev) => [...prev, { url, alt: null }]);
        } else {
          setImageError(json.message ?? `Could not upload “${file.name}”`);
        }
      } catch {
        setImageError(`Could not upload “${file.name}” — network error`);
      }
    }
    setUploading(false);
  };

  const setPrimary = (idx: number) =>
    setImages((prev) =>
      idx <= 0 ? prev : [prev[idx], ...prev.filter((_, i) => i !== idx)]
    );
  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // ── Variants ──────────────────────────────────────────────
  const addVariant = () =>
    setVariants((prev) => [...prev, { sku: "", color: "", size: "", price: "", stock: "0" }]);
  const patchVariant = (idx: number, key: keyof FormVariant, value: string) =>
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, [key]: value } : v)));
  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx));

  // ── Submit ────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Enter a product name (at least 2 characters)";
    if (!f.sku.trim()) errs.sku = "SKU is required";
    if (!f.categoryId) errs.categoryId = "Choose a category";

    const price = Number(f.price);
    if (!f.price.trim() || Number.isNaN(price) || price <= 0) {
      errs.price = "Enter a price greater than 0";
    }
    if (f.compareAtPrice.trim()) {
      const c = Number(f.compareAtPrice);
      if (Number.isNaN(c) || c < 0) errs.compareAtPrice = "Enter a valid compare-at price";
    }
    const disc = Number(f.discountPercent || 0);
    if (Number.isNaN(disc) || !Number.isInteger(disc) || disc < 0 || disc > 100) {
      errs.discountPercent = "Enter a whole number between 0 and 100";
    }
    const stock = Number(f.stock || 0);
    if (Number.isNaN(stock) || !Number.isInteger(stock) || stock < 0) {
      errs.stock = "Enter a whole number (0 or more)";
    }
    const low = Number(f.lowStockThreshold || 0);
    if (Number.isNaN(low) || !Number.isInteger(low) || low < 0) {
      errs.lowStockThreshold = "Enter a whole number (0 or more)";
    }

    // Keep rows that hold any data; blank placeholder rows are dropped.
    const kept = variants.filter(
      (v) => v.sku.trim() || v.color.trim() || v.size.trim() || v.price.trim() || (v.stock.trim() !== "" && v.stock.trim() !== "0")
    );
    const variantIssues: string[] = [];
    kept.forEach((v, i) => {
      const n = i + 1;
      if (!v.sku.trim()) variantIssues.push(`Row ${n}: SKU is required`);
      if (v.price.trim() !== "") {
        const p = Number(v.price);
        if (Number.isNaN(p) || p < 0) variantIssues.push(`Row ${n}: price must be 0 or more`);
      }
      const vs = Number(v.stock || 0);
      if (Number.isNaN(vs) || !Number.isInteger(vs) || vs < 0) {
        variantIssues.push(`Row ${n}: stock must be a whole number (0 or more)`);
      }
    });

    if (Object.keys(errs).length || variantIssues.length) {
      setErrors(errs);
      setError(
        variantIssues.length
          ? `Fix the highlighted fields — ${variantIssues.join(" · ")}`
          : "Fix the highlighted fields below"
      );
      return;
    }
    setErrors({});

    const payload = {
      name: f.name.trim(),
      slug: f.slug.trim() || null,
      sku: f.sku.trim(),
      brandId: f.brandId || null,
      categoryId: f.categoryId,
      price,
      compareAtPrice: f.compareAtPrice.trim() === "" ? null : Number(f.compareAtPrice),
      discountPercent: disc,
      stock,
      lowStockThreshold: low,
      status: f.status,
      isFeatured: f.isFeatured,
      isBestseller: f.isBestseller,
      newArrival: f.newArrival,
      isDeal: f.isDeal,
      shortDescription: f.shortDescription.trim() || null,
      description: f.description.trim() || null,
      colors: splitList(f.colors),
      sizes: splitList(f.sizes),
      seoTitle: f.seoTitle.trim() || null,
      seoDescription: f.seoDescription.trim() || null,
      images: images.map((img) => ({ url: img.url, alt: img.alt })),
      variants: kept.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        sku: v.sku.trim(),
        color: v.color.trim() || null,
        size: v.size.trim() || null,
        price: v.price.trim() === "" ? null : Number(v.price),
        stock: Number(v.stock || 0),
      })),
    };

    setBusy(true);
    try {
      const url = mode === "create" ? "/api/admin/products" : `/api/admin/products/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setError(json.message ?? "Could not save the product");
        setBusy(false);
        return;
      }
      setNotice(mode === "create" ? "Product created — redirecting…" : "Product saved — redirecting…");
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-mist-50">
            {mode === "create" ? "New product" : "Edit product"}
          </h1>
          <p className="mt-0.5 text-sm text-mist-500">
            {mode === "create"
              ? "Add a product to the catalog."
              : `Editing ${initial?.name ?? ""}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] text-success">
          {notice}
        </div>
      )}

      {/* ── Basics ─────────────────────────────────────────── */}
      <Panel title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <TextInput
              value={f.name}
              onChange={(e) => {
                const name = e.target.value;
                setF((prev) => ({
                  ...prev,
                  name,
                  ...(slugTouched ? {} : { slug: slugify(name) }),
                }));
              }}
              placeholder="e.g. Women's Embroidered Kurti"
            />
          </Field>
          <Field
            label="Slug"
            hint="URL — edit freely; auto-filled from the name until you do."
            error={errors.slug}
          >
            <TextInput
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              placeholder="womens-embroidered-kurti"
            />
          </Field>
          <Field label="SKU" hint="Stock-keeping unit — must be unique." error={errors.sku}>
            <TextInput value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="IM-00001" />
          </Field>
          <Field label="Brand">
            <Select className="select-dark" value={f.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" error={errors.categoryId}>
            <CategoryPicker
              options={categories}
              value={f.categoryId}
              onChange={(id) => set("categoryId", id)}
              invalid={Boolean(errors.categoryId)}
            />
          </Field>
          <Field label="Status" hint="Draft = hidden, Active = visible, Archived = retired.">
            <Select className="select-dark" value={f.status} onChange={(e) => set("status", e.target.value)}>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "DRAFT" ? "Draft" : s === "ACTIVE" ? "Active" : "Archived"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* ── Pricing & inventory ──────────────────────────── */}
        <Panel title="Pricing & inventory">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (৳)" error={errors.price}>
              <TextInput
                type="number"
                min={0}
                step="0.01"
                value={f.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="1250"
              />
            </Field>
            <Field label="Compare-at price (৳)" hint="The “was” price shown struck through." error={errors.compareAtPrice}>
              <TextInput
                type="number"
                min={0}
                step="0.01"
                value={f.compareAtPrice}
                onChange={(e) => set("compareAtPrice", e.target.value)}
                placeholder="1750"
              />
            </Field>
            <Field label="Discount %" error={errors.discountPercent}>
              <TextInput
                type="number"
                min={0}
                max={100}
                step={1}
                value={f.discountPercent}
                onChange={(e) => set("discountPercent", e.target.value)}
                placeholder="0"
              />
            </Field>
            <div className="flex items-end">
              {showSale ? (
                <p className="text-[0.84rem] leading-relaxed text-mist-400">
                  Sale price:{" "}
                  <strong className="font-display text-gold-300">{formatBDT(salePrice(priceNum, discountNum))}</strong>{" "}
                  <span className="text-mist-600 line-through">{formatBDT(priceNum)}</span>{" "}
                  <span className="text-mist-600">({discountNum}% off)</span>
                </p>
              ) : (
                <p className="pb-2.5 text-[0.8rem] text-mist-600">
                  No discount — sold at {priceNum > 0 ? formatBDT(priceNum) : "the entered price"}.
                </p>
              )}
            </div>
            <Field label="Stock" error={errors.stock}>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={f.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
            </Field>
            <Field
              label="Low-stock threshold"
              hint="Flagged as Low when stock is at or below this."
              error={errors.lowStockThreshold}
            >
              <TextInput
                type="number"
                min={0}
                step={1}
                value={f.lowStockThreshold}
                onChange={(e) => set("lowStockThreshold", e.target.value)}
              />
            </Field>
          </div>
        </Panel>

        {/* ── Flags ────────────────────────────────────────── */}
        <Panel title="Storefront flags">
          <div className="space-y-3">
            <Checkbox label="Featured" checked={f.isFeatured} onChange={(v) => set("isFeatured", v)} />
            <Checkbox label="Bestseller" checked={f.isBestseller} onChange={(v) => set("isBestseller", v)} />
            <Checkbox label="New arrival" checked={f.newArrival} onChange={(v) => set("newArrival", v)} />
            <Checkbox label="Deal" checked={f.isDeal} onChange={(v) => set("isDeal", v)} />
          </div>
          <p className="mt-4 border-t border-white/[0.07] pt-3 text-[0.76rem] leading-relaxed text-mist-600">
            Flags drive the homepage sections and storefront badges.
          </p>
        </Panel>
      </div>

      {/* ── Descriptions ───────────────────────────────────── */}
      <Panel title="Descriptions">
        <div className="space-y-4">
          <Field label="Short description" hint="One or two lines — used in cards and meta description.">
            <TextArea
              value={f.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              maxLength={500}
              className="min-h-20"
            />
          </Field>
          <Field label="Full description">
            <TextArea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              className="min-h-40"
            />
          </Field>
        </div>
      </Panel>

      {/* ── Variant dimensions ─────────────────────────────── */}
      <Panel title="Variant options">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colors" hint="Comma-separated, e.g. Black, Gold, Maroon">
            <TextInput
              value={f.colors}
              onChange={(e) => set("colors", e.target.value)}
              placeholder="Black, Gold"
            />
          </Field>
          <Field label="Sizes" hint="Comma-separated, e.g. S, M, L, XL">
            <TextInput
              value={f.sizes}
              onChange={(e) => set("sizes", e.target.value)}
              placeholder="S, M, L"
            />
          </Field>
        </div>
      </Panel>

      {/* ── Images ─────────────────────────────────────────── */}
      <Panel title="Images" subtitle="The first image is the primary — order follows the array index.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-50">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload images"}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={onPickFiles}
              disabled={uploading}
            />
          </label>
          <span className="text-[0.76rem] text-mist-600">JPEG, PNG, WebP, GIF or SVG · max 4MB each</span>
        </div>

        {imageError && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
            {imageError}
          </p>
        )}

        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-[0.84rem] text-mist-600">
            No images yet — the first image you upload becomes the primary.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((img, i) => (
              <div
                key={`${img.url}-${i}`}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-ink-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-950">
                      Primary
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-white/[0.07] px-1.5 py-1">
                  {i > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPrimary(i)}
                      className="text-[0.66rem] font-semibold text-gold-400 transition hover:text-gold-300"
                    >
                      Make primary
                    </button>
                  ) : (
                    <span className="text-[0.66rem] text-mist-600">#{i + 1}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label="Remove image"
                    className="rounded p-1 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Variants table ─────────────────────────────────── */}
      <Panel
        title="Variants"
        action={
          <Btn variant="outline" onClick={addVariant}>
            <Plus size={14} /> Add variant
          </Btn>
        }
      >
        <p className="mb-3 text-[0.78rem] leading-relaxed text-mist-600">
          Rows are saved when you save the product. Removing a row deletes that variant — variants
          already referenced by order history are protected by the API. Leave price empty to fall
          back to the product price.
        </p>
        {variants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[0.84rem] text-mist-600">
            No variants — use “Add variant” for per color/size stock.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Color</Th>
                <Th>Size</Th>
                <Th>Price (৳)</Th>
                <Th>Stock</Th>
                <Th className="text-right">Remove</Th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.id ?? `new-${i}`}>
                  <Td>
                    <TextInput
                      value={v.sku}
                      onChange={(e) => patchVariant(i, "sku", e.target.value)}
                      placeholder="IM-00001-BLK-M"
                      className="px-2.5 py-1.5 text-[0.8rem]"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={v.color}
                      onChange={(e) => patchVariant(i, "color", e.target.value)}
                      placeholder="Black"
                      className="px-2.5 py-1.5 text-[0.8rem]"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={v.size}
                      onChange={(e) => patchVariant(i, "size", e.target.value)}
                      placeholder="M"
                      className="w-20 px-2.5 py-1.5 text-[0.8rem]"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="number"
                      min={0}
                      step="0.01"
                      value={v.price}
                      onChange={(e) => patchVariant(i, "price", e.target.value)}
                      placeholder="—"
                      className="w-28 px-2.5 py-1.5 text-[0.8rem]"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="number"
                      min={0}
                      step={1}
                      value={v.stock}
                      onChange={(e) => patchVariant(i, "stock", e.target.value)}
                      className="w-24 px-2.5 py-1.5 text-[0.8rem]"
                    />
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      aria-label="Remove variant row"
                      className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {/* ── SEO ────────────────────────────────────────────── */}
      <Panel title="SEO">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SEO title" hint="Defaults to the product name if empty.">
            <TextInput
              value={f.seoTitle}
              onChange={(e) => set("seoTitle", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="SEO description" hint="Shown in search results — keep it under ~160 characters." className="sm:col-span-2">
            <TextArea
              value={f.seoDescription}
              onChange={(e) => set("seoDescription", e.target.value)}
              maxLength={400}
              className="min-h-20"
            />
          </Field>
        </div>
      </Panel>

      {/* ── Save ───────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 border-t border-white/[0.07] pt-5">
        <Btn variant="outline" href="/admin/products">
          Cancel
        </Btn>
        <BusyBtn busy={busy} type="submit">
          {mode === "create" ? "Create product" : "Save changes"}
        </BusyBtn>
      </div>
    </form>
  );
}
