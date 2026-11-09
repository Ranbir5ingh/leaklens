import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set — see deployment.md");

const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
// prepare:false keeps us compatible with transaction-mode poolers (Neon / PgBouncer).
export const sql = g.__pg ?? postgres(url, { max: process.env.VERCEL ? 3 : 10, prepare: false, idle_timeout: 20, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") g.__pg = sql;

export const db = drizzle(sql, { schema });
export { schema };
