// The app uses SQLite on this PC and PostgreSQL online. Prisma cannot switch per environment,
// so the online build rewrites the schema's database block before generating the client.
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.log("DATABASE_URL is not PostgreSQL, so the schema stays on SQLite.");
  process.exit(0);
}

const path = new URL("../prisma/schema.prisma", import.meta.url);
const schema = readFileSync(path, "utf8");
const sqlite = /datasource db \{[^}]*\}/;
if (!sqlite.test(schema)) throw new Error("Could not find the datasource block in schema.prisma");

// Schema changes need a direct connection; the app itself uses the pooled one.
const direct = process.env.DATABASE_URL_UNPOOLED ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
writeFileSync(path, schema.replace(sqlite, `datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("${direct}")\n}`));
console.log(`Schema switched to PostgreSQL (schema changes use ${direct}).`);
