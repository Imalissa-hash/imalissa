/**
 * Client-safe data shapes shared between server code and components.
 * (This file must never import server-only modules.)
 */

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  stock: number;
  image: string | null;
  brandName: string | null;
  categoryName: string;
  categorySlug: string;
  rating: number;
  reviewCount: number;
  soldCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  colors: string[];
  sizes: string[];
}

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  image: string | null;
  sku: string;
  color: string | null;
  size: string | null;
  variantLabel: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  stockAvailable: number;
  inStock: boolean;
  maxQuantity: number;
}

export interface CartState {
  items: CartLine[];
  subtotal: number;
  savings: number;
  itemCount: number;
  couponCode: string | null;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CategoryNodeData {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  icon: string | null;
  children: CategoryNodeData[];
}
