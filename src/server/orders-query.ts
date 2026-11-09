import "server-only";
import { z } from "zod";
import { sql } from "@/db";
import { todayIST } from "./recon";

export const orderFilterSchema = z.object({
  status: z.enum(["settled", "short_paid", "unpaid_past_due", "freight_overcharged", "return_not_received", "awaiting_payment"]).optional().catch(undefined),
  partner: z.string().regex(/^[A-Z0-9]{2,4}$/).optional().catch(undefined),
  channel: z.string().regex(/^[A-Z0-9]{2,4}$/).optional().catch(undefined),
  q: z.string().trim().max(60).optional().catch(undefined),
  risk: z.enum(["1"]).optional().catch(undefined),
  age: z.enum(["0-15", "16-30", "31-60", "60+"]).optional().catch(undefined),
  sort: z.enum(["risk", "diff", "date", "value"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type OrderFilter = z.infer<typeof orderFilterSchema>;

export const PAGE_SIZE = 50;

function where(f: OrderFilter) {
  const asOf = todayIST();
  const parts = [sql`true`];
  if (f.status) parts.push(sql`r.status = ${f.status}`);
  if (f.channel) parts.push(sql`r.channel = ${f.channel}`);
  if (f.partner) parts.push(sql`(r.partner = ${f.partner} or exists (select 1 from claims c where c.order_id = r.order_id and c.partner = ${f.partner} and c.status in ('open','raised')))`);
  if (f.risk) parts.push(sql`r.at_risk > 0`);
  if (f.age) {
    const [lo, hi] = f.age === "60+" ? [61, 100000] : f.age.split("-").map(Number);
    parts.push(sql`exists (select 1 from claims c where c.order_id = r.order_id and c.status in ('open','raised') ${f.partner ? sql`and c.partner = ${f.partner}` : sql``} and (${asOf}::date - coalesce(c.risk_since, ${asOf}::date)) between ${lo} and ${hi})`);
  }
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "")}%`;
    parts.push(sql`(r.order_id ilike ${like} or exists (select 1 from orders o where o.order_id = r.order_id and o.awb ilike ${like}))`);
  }
  return parts.reduce((a, b) => sql`${a} and ${b}`);
}

export async function listOrders(f: OrderFilter) {
  const page = f.page ?? 1;
  const order =
    f.sort === "diff" ? sql`r.difference asc` : f.sort === "date" ? sql`r.order_date desc` : f.sort === "value" ? sql`r.value desc` : sql`r.at_risk desc, r.order_date desc`;
  const w = where(f);
  const [rows, [{ n, risk }]] = await Promise.all([
    sql<OrderListRow[]>`select r.order_id, r.channel, r.partner, r.status, r.order_date::text, r.value, r.payment_mode, r.delivery_status, r.expected, r.received, r.difference, r.at_risk, r.tcs, r.tds
        from recon_results r where ${w} order by ${order}, r.order_id limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    sql<{ n: number; risk: string }[]>`select count(*)::int as n, coalesce(sum(r.at_risk),0)::bigint as risk from recon_results r where ${w}`,
  ]);
  return { rows, total: n, risk: Number(risk), page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

export async function exportOrders(f: OrderFilter) {
  return sql<OrderListRow[]>`select r.order_id, r.channel, r.partner, r.status, r.order_date::text, r.value, r.payment_mode, r.delivery_status, r.expected, r.received, r.difference, r.at_risk, r.tcs, r.tds
      from recon_results r where ${where(f)} order by r.at_risk desc, r.order_id limit 200000`;
}

export interface OrderListRow {
  order_id: string;
  channel: string;
  partner: string;
  status: string;
  order_date: string;
  value: number;
  payment_mode: string;
  delivery_status: string;
  expected: number;
  received: number;
  difference: number;
  at_risk: number;
  tcs: number;
  tds: number;
}
