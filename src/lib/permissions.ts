import { forbidden } from "./errors";
import { requireAdmin, type AdminIdentity } from "./admin-auth";
import { prisma } from "./db";

/**
 * ============================================================
 * Fine-grained admin permissions (Roles & Permissions)
 * ============================================================
 *
 * - SUPER_ADMIN always holds every permission (the owner can never lock
 *   themselves out), and only SUPER_ADMIN can edit permissions (the
 *   Roles API uses requireRole(), which no RolePermission row can widen).
 * - Every other role reads its grants from RolePermission. No rows for a
 *   role = never configured = built-in defaults below; once saved, the
 *   stored matrix is authoritative (an empty save really is empty).
 * - requirePermission() fails CLOSED: an unknown key denies non-super
 *   admins instead of silently allowing them.
 */

export interface PermissionDef {
  key: string;
  label: string;
  /** Grouping shown on the Roles & Permissions page. */
  group: string;
  /** Super Admin only — never grantable through the UI. */
  superOnly?: boolean;
}

export const PERMISSIONS: PermissionDef[] = [
  // Catalog
  { key: "products.view", label: "View products", group: "Catalog" },
  { key: "products.manage", label: "Add, edit & delete products", group: "Catalog" },
  { key: "categories.view", label: "View categories", group: "Catalog" },
  { key: "categories.manage", label: "Add, edit & delete categories", group: "Catalog" },
  { key: "inventory.view", label: "View inventory & stock logs", group: "Catalog" },
  { key: "inventory.manage", label: "Adjust stock", group: "Catalog" },
  { key: "import.view", label: "Open Import products", group: "Catalog" },
  { key: "import.manage", label: "Run product imports", group: "Catalog" },

  // Sales
  { key: "orders.view", label: "View orders", group: "Sales" },
  { key: "orders.manage", label: "Change order status, notes & Push to API", group: "Sales" },
  { key: "sync.view", label: "View Sync Center", group: "Sales" },
  { key: "sync.manage", label: "Pull/verify external sync status", group: "Sales" },
  { key: "coupons.view", label: "View coupons", group: "Sales" },
  { key: "coupons.manage", label: "Create, edit & delete coupons", group: "Sales" },

  // Customers
  { key: "customers.view", label: "View customers", group: "Customers" },
  { key: "customers.manage", label: "Edit customers, reset passwords, send messages", group: "Customers" },
  { key: "reviews.view", label: "View reviews", group: "Customers" },
  { key: "reviews.manage", label: "Approve, reject & delete reviews", group: "Customers" },
  { key: "messages.view", label: "Read contact messages", group: "Customers" },
  { key: "messages.manage", label: "Mark read / archive contact messages", group: "Customers" },

  // Alerts
  { key: "alerts.view", label: "System Log — view alerts & mark them seen", group: "Alerts" },

  // Storefront
  { key: "homepage.view", label: "View homepage banners & sections", group: "Storefront" },
  { key: "homepage.manage", label: "Edit homepage banners & sections", group: "Storefront" },
  { key: "analytics.view", label: "View analytics", group: "Storefront" },

  // System
  { key: "settings.view", label: "View settings", group: "System" },
  { key: "settings.manage", label: "Change settings & partner API connection", group: "System" },
  { key: "admins.view", label: "View admin accounts", group: "System" },
  { key: "audit.view", label: "View audit log", group: "System" },
  {
    key: "roles.manage",
    label: "Roles & Permissions (Super Admin only)",
    group: "System",
    superOnly: true,
  },
];

export const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

/** Built-in grants for a role that has never been configured. */
export const DEFAULT_GRANTS: Record<string, string[]> = {
  // Manager: day-to-day operations — everything except super-only keys.
  MANAGER: PERMISSIONS.filter((p) => !p.superOnly).map((p) => p.key),
  // Support: customer-facing work only.
  SUPPORT: [
    "orders.view",
    "orders.manage",
    "sync.view",
    "sync.manage",
    "coupons.view",
    "customers.view",
    "reviews.view",
    "reviews.manage",
    "messages.view",
    "messages.manage",
    "alerts.view",
    "analytics.view",
  ],
  // Content: catalog & storefront content.
  CONTENT: [
    "products.view",
    "products.manage",
    "categories.view",
    "categories.manage",
    "inventory.view",
    "import.view",
    "import.manage",
    "homepage.view",
    "homepage.manage",
    "reviews.view",
    "analytics.view",
    "alerts.view",
  ],
};

const GRANTABLE = PERMISSIONS.filter((p) => !p.superOnly).map((p) => p.key);

/**
 * Effective permission set for a role. SUPER_ADMIN → everything; other
 * roles → stored matrix (when rows exist) else built-in defaults. Super
 * -only keys are stripped for everyone else — they cannot be granted.
 */
export async function getRolePermissions(role: string): Promise<Set<string>> {
  if (role === "SUPER_ADMIN") return new Set(PERMISSIONS.map((p) => p.key));

  const rows = await prisma.rolePermission.findMany({ where: { role: role as never } });
  const effective = rows.length > 0
    ? rows.filter((r) => r.granted).map((r) => r.permission)
    : (DEFAULT_GRANTS[role] ?? []);
  return new Set(effective.filter((k) => PERMISSION_KEYS.has(k) && !isSuperOnly(k)));
}

export function isSuperOnly(key: string): boolean {
  return PERMISSIONS.find((p) => p.key === key)?.superOnly === true;
}

export const permissionLabel = (key: string): string =>
  PERMISSIONS.find((p) => p.key === key)?.label ?? key;

/**
 * Require a logged-in admin whose role grants `permission`, or throw
 * ApiError(403). Returns the admin identity (same shape as requireAdmin)
 * so call sites keep their audit trail.
 */
export async function requirePermission(permission: string): Promise<AdminIdentity> {
  const admin = await requireAdmin();
  if (admin.role === "SUPER_ADMIN") return admin;

  const granted = await getRolePermissions(admin.role);
  if (!granted.has(permission) || isSuperOnly(permission)) {
    throw forbidden(
      `Your admin role (${admin.role.replace("_", " ")}) does not include "${permissionLabel(permission)}" — a Super Admin can grant it in Roles & Permissions.`
    );
  }
  return admin;
}

/** Non-throwing variant for page-level guards. */
export async function canAccess(admin: AdminIdentity, permission: string): Promise<boolean> {
  if (admin.role === "SUPER_ADMIN") return true;
  if (!PERMISSION_KEYS.has(permission) || isSuperOnly(permission)) return false;
  const granted = await getRolePermissions(admin.role);
  return granted.has(permission);
}

/** All grantable keys — used by the Roles & Permissions API. */
export function grantableKeys(): string[] {
  return [...GRANTABLE];
}
