import { PrismaClient } from "@prisma/client";

// Prisma client singleton — avoids exhausting connections during dev HMR.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Cap the per-process connection pool.
 *
 * Aiven MySQL on this plan allows 46 connections in total, while Prisma's
 * default pool is `num_physical_cpus * 2 + 1` *per process*. `next build`
 * prerenders routes across several worker processes, so the default pools
 * stacked up past 46 and the Render build died with HY000 1040 "Too many
 * database connections opened".
 *
 * A URL that already carries connection_limit (e.g. set in the host's
 * environment) is respected as-is.
 */
const rawUrl = process.env.DATABASE_URL ?? "";
const datasourceUrl = rawUrl
  ? /([?&])connection_limit=/.test(rawUrl)
    ? rawUrl
    : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}connection_limit=5`
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
