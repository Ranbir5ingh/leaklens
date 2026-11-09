import "server-only";
import { sql } from "@/db";
import { todayIST } from "./recon";

export const RISK_OPEN = ["open", "raised"];

export async function lastRun() {
  const [r] = await sql<{ id: number; as_of: string; started_at: Date; duration_ms: number | null; timings: Record<string, number> | null; stats: Record<string, unknown> | null; trigger: string | null; name: string | null }[]>`
    select r.id, r.as_of::text, r.started_at, r.duration_ms, r.timings, r.stats, r.trigger, u.name from recon_runs r left join users u on u.id = r.triggered_by order by r.id desc limit 1`;
  return r ?? null;
}

const AGE_SQL = (asOf: string) => sql`case when risk_since is null or ${asOf}::date - risk_since <= 15 then '0-15' when ${asOf}::date - risk_since <= 30 then '16-30' when ${asOf}::date - risk_since <= 60 then '31-60' else '60+' end`;

export async function riskMatrix() {
  const asOf = todayIST();
  return sql<{ partner: string; bucket: string; amount: string; n: number }[]>`
    select partner, ${AGE_SQL(asOf)} as bucket, sum(amount)::bigint as amount, count(*)::int as n
    from claims where status = any(${RISK_OPEN}) group by 1, 2`;
}

export async function riskByType() {
  return sql<{ type: string; amount: string; n: number }[]>`select type, sum(amount)::bigint as amount, count(*)::int as n from claims where status = any(${RISK_OPEN}) group by 1 order by 2 desc`;
}

export async function headline() {
  const [h] = await sql<{ at_risk: string; risk_orders: number; orders: number; settled: number; recovered: string; tcs: string; tds: string; pending_review: number; awaiting: number }[]>`
    select
      (select coalesce(sum(amount), 0)::bigint from claims where status = any(${RISK_OPEN})) as at_risk,
      (select count(distinct order_id)::int from claims where status = any(${RISK_OPEN})) as risk_orders,
      (select count(*)::int from recon_results) as orders,
      (select count(*)::int from recon_results where status = 'settled') as settled,
      (select count(*)::int from recon_results where status = 'awaiting_payment') as awaiting,
      (select coalesce(sum(recovered_amount), 0)::bigint from claims) as recovered,
      (select coalesce(sum(tcs), 0)::bigint from settlements) as tcs,
      (select coalesce(sum(tds), 0)::bigint from settlements) as tds,
      (select count(distinct (orphan_kind, orphan_row_id))::int from match_suggestions where status = 'pending') as pending_review`;
  return h;
}

export async function partnerNames(): Promise<Record<string, string>> {
  const rows = await sql<{ code: string; name: string }[]>`select code, name from partners`;
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}
