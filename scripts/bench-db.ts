import postgres from "postgres";
import "dotenv/config";
import type { ReconResult } from "@/lib/domain/types";
import { bulkInsert } from "@/server/bulk";

/** Times writing reconciliation results to Postgres (scratch table, dropped afterwards). */
export async function benchDbWrite(results: ReconResult[]): Promise<number> {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
  await sql`create temp table bench_results (like recon_results including defaults)`;
  const t0 = performance.now();
  await bulkInsert(sql, "bench_results", results.map((r) => ({
    order_id: r.orderId, run_id: 0, channel: r.channel, partner: r.partner, status: r.status, order_date: "2026-11-01", value: 0, payment_mode: "COD", delivery_status: "delivered",
    expected: r.expected, received: r.received, difference: r.difference, tcs: r.tcs, tds: r.tds, expected_freight: r.expectedFreight, billed_freight: r.billedFreight, due_date: r.dueDate,
    at_risk: r.atRisk, risk_since: r.riskSince, issues: r.issues, expected_lines: r.expectedLines, received_lines: r.receivedLines,
  })));
  const ms = performance.now() - t0;
  await sql.end();
  return ms;
}
