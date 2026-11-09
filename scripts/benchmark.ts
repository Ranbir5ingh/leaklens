/**
 * Benchmark: 1 lakh orders (plus every related settlement, COD, freight and return-scan row) go
 * through the full pipeline the app uses — CSV text → parse → column mapping + validation →
 * matching engine → match suggestions. Optionally (--db) also bulk-writes results to Postgres.
 *
 *   npx tsx scripts/benchmark.ts [--orders 100000] [--db]
 */
import Papa from "papaparse";
import { generate } from "@/lib/data/generate";
import { formatToMapping } from "@/lib/data/formats";
import { parseFile } from "@/lib/data/pipeline";
import { reconcile } from "@/lib/domain/engine";
import { DEFAULT_RATE_CARDS, GATEWAY_PARTNER, partnerKinds } from "@/lib/domain/partners";
import { suggestMatches, type Candidate } from "@/lib/domain/suggest-matches";
import type { CodRow, FreightRow, OrderRow, ReturnScanRow, SettlementRow } from "@/lib/domain/types";
import type { RawRow } from "@/lib/domain/mapping";

export async function runBenchmark(nOrders: number, log = console.log) {
  const asOf = "2026-11-09";
  const t = () => performance.now();
  const timings: Record<string, number> = {};

  let t0 = t();
  const data = generate({ orders: nOrders, asOf, days: 75 });
  const csv: Record<string, string> = {};
  let totalRows = 0, bytes = 0;
  for (const [k, f] of Object.entries(data.files)) {
    csv[k] = Papa.unparse(f.rows);
    totalRows += f.rows.length;
    bytes += csv[k].length;
  }
  timings.generate = t() - t0;

  t0 = t();
  const parsed: Record<string, RawRow[]> = {};
  for (const [k, text] of Object.entries(csv)) parsed[k] = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true }).data;
  timings.parseCsv = t() - t0;

  t0 = t();
  const orders: OrderRow[] = [], settlements: SettlementRow[] = [], cod: CodRow[] = [], freight: FreightRow[] = [], returnScans: ReturnScanRow[] = [];
  let rejected = 0;
  for (const [k, rows] of Object.entries(parsed)) {
    const f = data.files[k].format;
    const res = parseFile(f.kind, f.partner, formatToMapping(f), rows);
    rejected += res.rejected.length;
    const target = { orders, settlement: settlements, cod, freight, returns: returnScans }[f.kind] as unknown[];
    for (const r of res.rows) target.push(r);
  }
  timings.mapAndValidate = t() - t0;

  t0 = t();
  const out = reconcile({ orders, settlements, cod, freight, returnScans, rateCards: DEFAULT_RATE_CARDS, partnerKinds: partnerKinds(), gatewayPartner: GATEWAY_PARTNER, asOf });
  timings.match = t() - t0;

  t0 = t();
  const awbOf = new Map(orders.map((o) => [o.orderId, o.awb]));
  const cands: Candidate[] = out.results
    .filter((r) => r.receivedLines.every((l) => l.source !== "settlement" && l.source !== "cod"))
    .map((r) => ({ orderId: r.orderId, partner: r.partner, awb: awbOf.get(r.orderId) ?? null, expected: r.expected, anchorDate: r.dueDate }));
  const sugg = suggestMatches(out.orphans, cands);
  timings.suggest = t() - t0;

  const pipeline = timings.parseCsv + timings.mapAndValidate + timings.match + timings.suggest;
  const summary = {
    orders: orders.length,
    partnerRows: totalRows - data.files["WEB:orders"].rows.length - ["MP1", "MP2", "MP3", "QC1", "QC2"].reduce((a, c) => a + data.files[`${c}:orders`].rows.length, 0),
    totalRows,
    csvMB: +(bytes / 1e6).toFixed(1),
    rejected,
    reconciled: out.stats.reconciled,
    autoMatchedRowsPct: +((out.stats.matchedPartnerRows / out.stats.totalPartnerRows) * 100).toFixed(2),
    byStatus: out.stats.byStatus,
    orphans: out.orphans.length,
    suggestions: sugg.length,
    msParseCsv: Math.round(timings.parseCsv),
    msMapValidate: Math.round(timings.mapAndValidate),
    msMatch: Math.round(timings.match),
    msSuggest: Math.round(timings.suggest),
    msPipelineTotal: Math.round(pipeline),
  };
  log(JSON.stringify(summary, null, 2));
  return { summary, out, data, orders };
}

const isMain = process.argv[1]?.includes("benchmark");
if (isMain) {
  const i = process.argv.indexOf("--orders");
  const n = i > 0 ? Number(process.argv[i + 1]) : 100_000;
  runBenchmark(n).then(async ({ summary, out }) => {
    if (process.argv.includes("--db")) {
      const { benchDbWrite } = await import("./bench-db");
      const ms = await benchDbWrite(out.results);
      console.log(JSON.stringify({ msDbWriteResults: Math.round(ms), rows: out.results.length }));
    }
    if (summary.msPipelineTotal > 60_000) {
      console.error("FAIL: pipeline exceeded 60 s");
      process.exit(1);
    }
  });
}
