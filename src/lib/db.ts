import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// A pooled PostgreSQL connection must tell Prisma it is pooled, or transactions can break.
function pooledUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("-pooler.") || url.includes("pgbouncer=")) return undefined;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

const datasourceUrl = pooledUrl();

export const db = globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Client = PrismaClient | Tx;
