import "server-only";
import { sql } from "@/db";

export interface TaxRow { month: string; partner: string; orders: number; gross: number; tcs: number; tds: number; expected_tcs: number; expected_tds: number }

/**
 * TCS (GST, s.52 CGST Act, 0.5% here) and TDS (s.194-O, 0.1%) withheld by marketplaces.
 * These are tax credits to claim back in GSTR-2A / Form 26AS — not leakage, so they are kept
 * out of "money at risk" and reported here instead. Expected values assume 5% GST (assumption A7).
 */
export async function taxSummary(): Promise<TaxRow[]> {
  return sql<TaxRow[]>`
    select to_char(date_trunc('month', settlement_date), 'YYYY-MM') as month, partner,
      count(*) filter (where gross > 0)::int as orders,
      sum(gross)::bigint::int as gross, sum(tcs)::bigint::int as tcs, sum(tds)::bigint::int as tds,
      sum(round(round(gross / 1.05) * 0.005))::bigint::int as expected_tcs,
      sum(round(round(gross / 1.05) * 0.001))::bigint::int as expected_tds
    from settlements where gross > 0 or tcs <> 0 or tds <> 0
    group by 1, 2 having sum(tcs) <> 0 or sum(tds) <> 0 order by 1 desc, 2`;
}
