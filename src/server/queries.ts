import "server-only";
import { sql } from "@/db";
import { todayIST } from "./recon";

export const RISK_OPEN = ["open", "raised"];
export const PERIODS = [
  { key: "all", label: "All orders", days: null },
  { key: "30", label: "30 days", days: 30 },
  { key: "60", label: "60 days", days: 60 },
  { key: "90", label: "90 days", days: 90 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export const parsePeriod = (v: unknown) => PERIODS.find((p) => p.key === v) ?? PERIODS[0];

export async function lastRun() {
  const [r] = await sql<{ id: number; as_of: string; started_at: Date; duration_ms: number | null; timings: Record<string, number> | null; stats: Record<string, unknown> | null; trigger: string | null; name: string | null }[]>`
    select r.id, r.as_of::text, r.started_at, r.duration_ms, r.timings, r.stats, r.trigger, u.name from recon_runs r left join users u on u.id = r.triggered_by order by r.id desc limit 1`;
  return r ?? null;
}

/** Period = orders placed in the last N days (by order date). null = all orders. */
const since = (days: number | null) => (days === null ? sql`true` : sql`r.order_date >= ${todayIST()}::date - ${days}::int`);
const AGE_SQL = (asOf: string) => sql`case when c.risk_since is null or ${asOf}::date - c.risk_since <= 15 then '0-15' when ${asOf}::date - c.risk_since <= 30 then '16-30' when ${asOf}::date - c.risk_since <= 60 then '31-60' else '60+' end`;

export async function riskMatrix(days: number | null = null) {
  const asOf = todayIST();
  return sql<{ partner: string; bucket: string; amount: string; n: number }[]>`
    select c.partner, ${AGE_SQL(asOf)} as bucket, sum(c.amount)::bigint as amount, count(*)::int as n
    from claims c join recon_results r using (order_id) where c.status = any(${RISK_OPEN}) and ${since(days)} group by 1, 2`;
}

export async function riskByType(days: number | null = null) {
  return sql<{ type: string; amount: string; n: number }[]>`select c.type, sum(c.amount)::bigint as amount, count(*)::int as n
    from claims c join recon_results r using (order_id) where c.status = any(${RISK_OPEN}) and ${since(days)} group by 1 order by 2 desc`;
}

export async function topClaims(days: number | null = null, limit = 6) {
  return sql<{ id: number; partner: string; order_id: string; type: string; amount: number; risk_since: string | null; status: string }[]>`
    select c.id, c.partner, c.order_id, c.type, c.amount, c.risk_since::text, c.status from claims c join recon_results r using (order_id)
    where c.status = 'open' and ${since(days)} order by c.amount desc, c.risk_since limit ${limit}`;
}

export async function headline(days: number | null = null) {
  const asOf = todayIST();
  const [h] = await sql<{ at_risk: string; risk_orders: number; new_7d: string; orders: number; settled: number; recovered: string; tcs: string; tds: string; pending_review: number; awaiting: number; raised: string }[]>`
    select
      (select coalesce(sum(c.amount), 0)::bigint from claims c join recon_results r using (order_id) where c.status = any(${RISK_OPEN}) and ${since(days)}) as at_risk,
      (select coalesce(sum(c.amount), 0)::bigint from claims c join recon_results r using (order_id) where c.status = 'raised' and ${since(days)}) as raised,
      (select count(distinct c.order_id)::int from claims c join recon_results r using (order_id) where c.status = any(${RISK_OPEN}) and ${since(days)}) as risk_orders,
      (select coalesce(sum(c.amount), 0)::bigint from claims c join recon_results r using (order_id) where c.status = any(${RISK_OPEN}) and c.risk_since > ${asOf}::date - 7 and ${since(days)}) as new_7d,
      (select count(*)::int from recon_results r where ${since(days)}) as orders,
      (select count(*)::int from recon_results r where r.status = 'settled' and ${since(days)}) as settled,
      (select count(*)::int from recon_results r where r.status = 'awaiting_payment' and ${since(days)}) as awaiting,
      (select coalesce(sum(c.recovered_amount), 0)::bigint from claims c join recon_results r using (order_id) where ${since(days)}) as recovered,
      (select coalesce(sum(r.tcs), 0)::bigint from recon_results r where ${since(days)}) as tcs,
      (select coalesce(sum(r.tds), 0)::bigint from recon_results r where ${since(days)}) as tds,
      (select count(distinct (orphan_kind, orphan_row_id))::int from match_suggestions where status = 'pending') as pending_review`;
  return h;
}

export async function partnerNames(): Promise<Record<string, string>> {
  const rows = await sql<{ code: string; name: string }[]>`select code, name from partners`;
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}
