import type { Sql } from "postgres";
import { reconcile, type Orphan } from "@/lib/domain/engine";
import { GATEWAY_PARTNER, partnerKinds } from "@/lib/domain/partners";
import { rateCardSchema, type RateCardBook } from "@/lib/domain/ratecards";
import { suggestMatches, type Candidate } from "@/lib/domain/suggest-matches";
import type { CodRow, FreightRow, OrderRow, ReturnScanRow, SettlementRow } from "@/lib/domain/types";
import { bulkInsert } from "./bulk";
import { audit } from "./audit";

/** "Today" for the client is Indian Standard Time. */
export function todayIST(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export async function loadRateCards(sql: Sql): Promise<RateCardBook> {
  const rows = await sql<{ partner_code: string; card: unknown }[]>`select partner_code, card from rate_cards where is_active`;
  const book: RateCardBook = {};
  for (const r of rows) {
    const parsed = rateCardSchema.safeParse(r.card);
    if (parsed.success) book[r.partner_code] = parsed.data;
  }
  return book;
}

const iso = (d: unknown): string | null => (d === null || d === undefined ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/**
 * Load every row, run the engine in memory, and write results, claims and suggestions back.
 * Set-based on both sides: 6 SELECTs in, chunked multi-row INSERTs out.
 */
export async function runReconciliation(sql: Sql, opts: { userId: number | null; trigger: string; asOf?: string }) {
  const asOf = opts.asOf ?? todayIST();
  const t0 = performance.now();
  const [orderRows, sRows, cRows, fRows, rRows, rateCards] = await Promise.all([
    sql`select order_id, channel, order_date, value, payment_mode, delivery_status, status_date, courier, awb, weight_kg, zone from orders`,
    sql`select id, partner, coalesce(linked_order_id, order_id) as order_id, settlement_ref, settlement_date, gross, commission, fixed_fee, shipping_fee, other_fees, tcs, tds, net from settlements`,
    sql`select id, partner, awb, coalesce(linked_order_id, order_id) as order_id, collected, remitted, remittance_date, utr from cod_remittances`,
    sql`select id, partner, awb, coalesce(linked_order_id, order_id) as order_id, invoice_no, invoice_date, billed_weight_kg, zone, forward, rto, cod_fee, total from freight_lines`,
    sql`select id, coalesce(linked_order_id, order_id) as order_id, awb, scanned_at, condition from return_scans`,
    loadRateCards(sql),
  ]);
  const tLoad = performance.now();

  const orders: OrderRow[] = orderRows.map((r) => ({ orderId: r.order_id, channel: r.channel, orderDate: iso(r.order_date)!, value: r.value, paymentMode: r.payment_mode, deliveryStatus: r.delivery_status, statusDate: iso(r.status_date), courier: r.courier, awb: r.awb, weightKg: r.weight_kg, zone: r.zone }));
  const settlements: SettlementRow[] = sRows.map((r) => ({ id: r.id, partner: r.partner, orderId: r.order_id, settlementRef: r.settlement_ref, settlementDate: iso(r.settlement_date)!, gross: r.gross, commission: r.commission, fixedFee: r.fixed_fee, shippingFee: r.shipping_fee, otherFees: r.other_fees, tcs: r.tcs, tds: r.tds, net: r.net }));
  const cod: CodRow[] = cRows.map((r) => ({ id: r.id, partner: r.partner, awb: r.awb, orderId: r.order_id, collected: r.collected, remitted: r.remitted, remittanceDate: iso(r.remittance_date)!, utr: r.utr }));
  const freight: FreightRow[] = fRows.map((r) => ({ id: r.id, partner: r.partner, awb: r.awb, orderId: r.order_id, invoiceNo: r.invoice_no, invoiceDate: iso(r.invoice_date)!, billedWeightKg: r.billed_weight_kg, zone: r.zone, forward: r.forward, rto: r.rto, codFee: r.cod_fee, total: r.total }));
  const returnScans: ReturnScanRow[] = rRows.map((r) => ({ id: r.id, orderId: r.order_id, awb: r.awb, scannedAt: iso(r.scanned_at)!, condition: r.condition }));

  const out = reconcile({ orders, settlements, cod, freight, returnScans, rateCards, partnerKinds: partnerKinds(), gatewayPartner: GATEWAY_PARTNER, asOf });
  const tMatch = performance.now();

  const orderById = new Map(orders.map((o) => [o.orderId, o]));
  const candidates: Candidate[] = out.results
    .filter((r) => !r.receivedLines.some((l) => l.source === "settlement" || l.source === "cod") || r.status === "return_not_received")
    .map((r) => ({ orderId: r.orderId, partner: r.partner, awb: orderById.get(r.orderId)?.awb ?? null, expected: r.expected, anchorDate: r.dueDate ?? orderById.get(r.orderId)?.statusDate ?? null }));
  const suggestions = suggestMatches(out.orphans, candidates);
  const tSuggest = performance.now();

  const runStats = { ...out.stats, orphans: out.orphans.length, suggestions: suggestions.length, skipped: out.skipped.length, skippedSample: out.skipped.slice(0, 20) };

  const runId = await sql.begin(async (tx) => {
    const [run] = await tx`insert into recon_runs (as_of, triggered_by, trigger, stats) values (${asOf}, ${opts.userId}, ${opts.trigger}, ${JSON.stringify(runStats)}::text::jsonb) returning id`;
    await tx`delete from recon_results`;
    await bulkInsert(tx as unknown as Sql, "recon_results", out.results.map((r) => {
      const o = orderById.get(r.orderId)!;
      return {
        order_id: r.orderId, run_id: run.id, channel: r.channel, partner: r.partner, status: r.status,
        order_date: o.orderDate, value: o.value, payment_mode: o.paymentMode, delivery_status: o.deliveryStatus,
        expected: r.expected, received: r.received, difference: r.difference, tcs: r.tcs, tds: r.tds,
        expected_freight: r.expectedFreight, billed_freight: r.billedFreight, due_date: r.dueDate,
        at_risk: r.atRisk, risk_since: r.riskSince,
        issues: r.issues, expected_lines: r.expectedLines, received_lines: r.receivedLines,
      };
    }));

    // Claims: one per (order, issue type). Re-runs update open claims; a claim whose issue has
    // disappeared (e.g. the payment arrived) is marked resolved, never deleted.
    const claimRows = out.results.flatMap((r) => r.issues.filter((i) => i.type !== "overpaid").map((i) => ({ partner: i.partner, order_id: r.orderId, type: i.type, amount: i.amount, risk_since: i.since })));
    await tx`create temp table cur_claims (partner text, order_id text, type text, amount int, risk_since date) on commit drop`;
    await bulkInsert(tx as unknown as Sql, "cur_claims", claimRows);
    await tx`insert into claims (partner, order_id, type, amount, risk_since)
             select partner, order_id, type, amount, risk_since from cur_claims
             on conflict (order_id, type) do update set amount = excluded.amount, partner = excluded.partner, risk_since = excluded.risk_since, updated_at = now(),
               status = case when claims.status = 'resolved' then 'open' else claims.status end
             where claims.status in ('open', 'resolved')`;
    await tx`update claims c set status = 'resolved', updated_at = now(), note = coalesce(c.note || ' · ', '') || 'Auto-resolved: issue no longer present on ' || ${asOf}
             where c.status = 'open' and not exists (select 1 from cur_claims k where k.order_id = c.order_id and k.type = c.type)`;

    // Suggestions: add new pending ones; retire pending ones whose row is no longer an orphan.
    await tx`delete from match_suggestions where status = 'pending' and candidate_order_id is null`;
    const orphanKeys = ["__none__", ...out.orphans.filter((o) => o.rowId !== undefined).map((o) => `${o.kind}:${o.rowId}`)];
    await tx`update match_suggestions set status = 'superseded' where status = 'pending' and not (orphan_kind || ':' || orphan_row_id = any(${orphanKeys}))`;
    const withSuggestion = new Set(suggestions.map((s) => `${s.orphan.kind}:${s.orphan.rowId}`));
    const row = (o: Orphan) => ({ orphan_kind: o.kind, orphan_row_id: o.rowId!, partner: o.partner, order_id_hint: o.orderIdHint, awb: o.awb, amount: o.amount, orphan_date: o.date });
    await bulkInsert(tx as unknown as Sql, "match_suggestions", suggestions.filter((s) => s.orphan.rowId !== undefined).map((s) => ({ ...row(s.orphan), candidate_order_id: s.orderId, confidence: s.confidence, reasons: s.reasons })), { onConflict: "on conflict do nothing" });
    await bulkInsert(tx as unknown as Sql, "match_suggestions", out.orphans.filter((o) => o.rowId !== undefined && !withSuggestion.has(`${o.kind}:${o.rowId}`)).map((o) => ({ ...row(o), candidate_order_id: null, confidence: 0, reasons: ["No plausible order found — check with the partner"] })), { onConflict: "on conflict do nothing" });
    return run.id as number;
  });
  const tWrite = performance.now();
  const timings = { loadMs: Math.round(tLoad - t0), matchMs: Math.round(tMatch - tLoad), suggestMs: Math.round(tSuggest - tMatch), writeMs: Math.round(tWrite - tSuggest), totalMs: Math.round(tWrite - t0) };
  await sql`update recon_runs set duration_ms = ${timings.totalMs}, timings = ${JSON.stringify(timings)}::text::jsonb where id = ${runId}`;
  await audit(sql, opts.userId, "recon.run", "recon_run", runId, { trigger: opts.trigger, ...timings, reconciled: out.stats.reconciled });
  return { runId, stats: runStats, timings };
}
