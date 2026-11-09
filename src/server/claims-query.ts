import "server-only";
import { z } from "zod";
import { sql } from "@/db";

export const claimFilterSchema = z.object({
  partner: z.string().regex(/^[A-Z0-9]{2,4}$/).optional().catch(undefined),
  status: z.enum(["open", "raised", "recovered", "rejected", "resolved", "active"]).optional().catch(undefined),
  type: z.enum(["short_paid", "unpaid_past_due", "freight_overcharged", "return_not_received"]).optional().catch(undefined),
  q: z.string().trim().max(60).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
  id: z.coerce.number().int().positive().optional().catch(undefined),
});
export type ClaimFilter = z.infer<typeof claimFilterSchema>;

export function claimWhere(f: ClaimFilter) {
  if (f.id) return sql`c.id = ${f.id}`;
  const parts = [sql`true`];
  if (f.partner) parts.push(sql`c.partner = ${f.partner}`);
  const st = f.status ?? "active";
  if (st === "active") parts.push(sql`c.status in ('open','raised')`);
  else parts.push(sql`c.status = ${st}`);
  if (f.type) parts.push(sql`c.type = ${f.type}`);
  if (f.q) parts.push(sql`c.order_id ilike ${"%" + f.q.replace(/[%_\\]/g, "") + "%"}`);
  return parts.reduce((a, b) => sql`${a} and ${b}`);
}

export interface ClaimRow {
  id: number;
  partner: string;
  order_id: string;
  type: string;
  amount: number;
  status: string;
  recovered_amount: number;
  note: string | null;
  risk_since: string | null;
  updated_at: Date;
  updated_by_name: string | null;
  expected: number | null;
  received: number | null;
  order_date: string | null;
}

export async function listClaims(f: ClaimFilter, limit = 50) {
  const page = f.page ?? 1;
  const w = claimWhere(f);
  const [rows, [agg]] = await Promise.all([
    sql<ClaimRow[]>`select c.id, c.partner, c.order_id, c.type, c.amount, c.status, c.recovered_amount, c.note, c.risk_since::text, c.updated_at, u.name as updated_by_name, r.expected, r.received, r.order_date::text
      from claims c left join users u on u.id = c.updated_by left join recon_results r on r.order_id = c.order_id
      where ${w} order by c.amount desc, c.id limit ${limit} offset ${(page - 1) * limit}`,
    sql<{ n: number; amount: string }[]>`select count(*)::int as n, coalesce(sum(c.amount),0)::bigint as amount from claims c where ${w}`,
  ]);
  return { rows, total: agg.n, amount: Number(agg.amount), page, pages: Math.max(1, Math.ceil(agg.n / limit)) };
}

export async function claimsForExport(f: ClaimFilter, limit: number) {
  return sql<(ClaimRow & { expected_lines: unknown; received_lines: unknown; issues: unknown; awb: string | null; channel: string | null })[]>`
    select c.id, c.partner, c.order_id, c.type, c.amount, c.status, c.recovered_amount, c.note, c.risk_since::text, c.updated_at, null as updated_by_name,
      r.expected, r.received, r.order_date::text, r.expected_lines, r.received_lines, r.issues, o.awb, o.channel
    from claims c left join recon_results r on r.order_id = c.order_id left join orders o on o.order_id = c.order_id
    where ${claimWhere(f)} order by c.partner, c.amount desc, c.id limit ${limit}`;
}

export async function partnerClaimSummary() {
  return sql<{ partner: string; open_amt: string; open_n: number; raised_amt: string; raised_n: number; recovered_amt: string }[]>`
    select partner,
      coalesce(sum(amount) filter (where status = 'open'), 0)::bigint as open_amt, count(*) filter (where status = 'open')::int as open_n,
      coalesce(sum(amount) filter (where status = 'raised'), 0)::bigint as raised_amt, count(*) filter (where status = 'raised')::int as raised_n,
      coalesce(sum(recovered_amount) filter (where status = 'recovered'), 0)::bigint as recovered_amt
    from claims group by partner order by 2 desc`;
}

export interface ClaimTimelineEntry { at: Date; who: string | null; action: string; note: string | null }

/** One claim with its timeline (creation, every status change from the audit log). */
export async function loadClaim(id: number) {
  const [c] = await sql<{ id: number; partner: string; order_id: string; type: string; amount: number; status: string; recovered_amount: number; note: string | null; risk_since: string | null; created_at: Date; updated_at: Date }[]>`
    select id, partner, order_id, type, amount, status, recovered_amount, note, risk_since::text, created_at, updated_at from claims where id = ${id}`;
  if (!c) return null;
  const events = await sql<ClaimTimelineEntry[]>`
    select a.at, u.name as who, a.action, a.detail->>'note' as note from audit_log a left join users u on u.id = a.user_id
    where a.entity = 'claims' and a.action like 'claims.%' and (a.entity_id = ${String(id)} or a.detail->'ids' @> ${JSON.stringify([id])}::text::jsonb)
    order by a.at`;
  return { claim: c, events };
}
