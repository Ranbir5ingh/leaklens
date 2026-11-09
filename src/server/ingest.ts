import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { normalizeRow, type ColumnMapping, type RawRow, type RowError } from "@/lib/domain/mapping";
import { typed } from "@/lib/data/pipeline";
import type { CodRow, FileKind, FreightRow, ReturnScanRow, SettlementRow } from "@/lib/domain/types";
import type { toOrder } from "@/lib/data/pipeline";
import { bulkInsert } from "./bulk";

/**
 * Server-side ingestion of one chunk of an upload. The browser has already dropped unmapped
 * columns and masked PII; we still re-run the same normalisation here because the server never
 * trusts the client. Partner rows are idempotent by a content hash, so re-uploading a file
 * (it happens every month-end) cannot double-count money.
 */
export interface ChunkResult {
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: { row: number; errors: RowError[] }[];
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

export async function ingestChunk(sql: Sql, args: { kind: FileKind; partner: string; mapping: ColumnMapping; uploadId: number; startRow: number; rows: RawRow[] }): Promise<ChunkResult> {
  const { kind, partner, mapping, uploadId } = args;
  const rejected: ChunkResult["rejected"] = [];
  const good: { rec: ReturnType<typeof typed>; key: string }[] = [];
  args.rows.forEach((raw, i) => {
    const { value, errors } = normalizeRow(kind, mapping, raw);
    const rowNo = args.startRow + i;
    if (errors.length) rejected.push({ row: rowNo, errors });
    else good.push({ rec: typed(kind, partner, value), key: hash(`${kind}|${partner}|${JSON.stringify(value)}`) });
  });

  // Same content twice inside one file is a genuine duplicate line, not two payments.
  const seen = new Set<string>();
  const unique = good.filter((g) => (seen.has(g.key) ? false : (seen.add(g.key), true)));
  let inserted = 0, updated = 0;

  if (kind === "orders") {
    const rows = unique.map(({ rec }) => {
      const o = rec as ReturnType<typeof toOrder>;
      return { order_id: o.orderId, channel: partner, order_date: o.orderDate, value: o.value, payment_mode: o.paymentMode, delivery_status: o.deliveryStatus, status_date: o.statusDate, courier: o.courier, awb: o.awb, weight_kg: o.weightKg, zone: o.zone, pincode: o.pincode, customer_name_masked: o.customerName, customer_phone_masked: o.customerPhone, upload_id: uploadId };
    });
    // Orders are upserted: the next export carries the latest delivery status for the same order.
    const ids = rows.map((r) => r.order_id);
    const existing = ids.length ? await sql<{ order_id: string; channel: string }[]>`select order_id, channel from orders where order_id = any(${ids})` : [];
    const clash = new Map(existing.filter((e) => e.channel !== partner).map((e) => [e.order_id, e.channel]));
    const ok = rows.filter((r) => !clash.has(r.order_id));
    for (const r of rows) if (clash.has(r.order_id)) rejected.push({ row: -1, errors: [{ field: "orderId", message: `${r.order_id} already belongs to ${clash.get(r.order_id)}` }] });
    await bulkInsert(sql, "orders", ok, {
      onConflict: `on conflict (order_id) do update set order_date = excluded.order_date, value = excluded.value, payment_mode = excluded.payment_mode, delivery_status = excluded.delivery_status, status_date = excluded.status_date, courier = excluded.courier, awb = excluded.awb, weight_kg = excluded.weight_kg, zone = excluded.zone, pincode = excluded.pincode, customer_name_masked = excluded.customer_name_masked, customer_phone_masked = excluded.customer_phone_masked, upload_id = excluded.upload_id, updated_at = now()`,
    });
    updated = existing.length - clash.size;
    inserted = ok.length - updated;
    return { inserted, updated, duplicates: good.length - unique.length, rejected };
  }

  const table = { settlement: "settlements", cod: "cod_remittances", freight: "freight_lines", returns: "return_scans" }[kind];
  const rows = unique.map(({ rec, key }) => {
    switch (kind) {
      case "settlement": {
        const s = rec as SettlementRow;
        return { partner, order_id: s.orderId, upload_id: uploadId, row_hash: key, settlement_ref: s.settlementRef, settlement_date: s.settlementDate, gross: s.gross, commission: s.commission, fixed_fee: s.fixedFee, shipping_fee: s.shippingFee, other_fees: s.otherFees, tcs: s.tcs, tds: s.tds, net: s.net };
      }
      case "cod": {
        const c = rec as CodRow;
        return { partner, order_id: c.orderId, upload_id: uploadId, row_hash: key, awb: c.awb, collected: c.collected, remitted: c.remitted, remittance_date: c.remittanceDate, utr: c.utr };
      }
      case "freight": {
        const f = rec as FreightRow;
        return { partner, order_id: f.orderId, upload_id: uploadId, row_hash: key, awb: f.awb, invoice_no: f.invoiceNo, invoice_date: f.invoiceDate, billed_weight_kg: f.billedWeightKg, zone: f.zone, forward: f.forward, rto: f.rto, cod_fee: f.codFee, total: f.total };
      }
      default: {
        const r = rec as ReturnScanRow;
        return { order_id: r.orderId, awb: r.awb, scanned_at: r.scannedAt, condition: r.condition, upload_id: uploadId, row_hash: key };
      }
    }
  });
  inserted = await bulkInsert(sql, table!, rows as Record<string, unknown>[], { onConflict: "on conflict (row_hash) do nothing" });
  return { inserted, updated: 0, duplicates: good.length - inserted, rejected };
}
