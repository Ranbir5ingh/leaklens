import "server-only";
import { sql } from "@/db";
import type { ExpectedLine, Issue, ReceivedLine } from "@/lib/domain/types";

export interface OrderDetail {
  r: { status: string; expected: number; received: number; difference: number; tcs: number; tds: number; due_date: string | null; at_risk: number; expected_lines: ExpectedLine[]; received_lines: ReceivedLine[]; issues: Issue[] } | null;
  o: { order_id: string; channel: string; payment_mode: string; value: number; order_date: string; status_date: string | null; delivery_status: string; awb: string | null; courier: string | null; weight_kg: number | null; zone: string | null; customer_name_masked: string | null; customer_phone_masked: string | null; pincode: string | null; file_name: string | null };
  claims: { id: number; partner: string; type: string; amount: number; status: string; recovered_amount: number; note: string | null; updated_at: Date }[];
  sources: { kind: string; partner: string; date: string | null; amount: number | null; ref: string; file_name: string | null; linked: boolean }[];
}

export async function loadOrderDetail(rawId: string): Promise<OrderDetail | null> {
  const id = rawId.slice(0, 80);
  const [[r], [o], claims, sources] = await Promise.all([
    sql`select status, expected, received, difference, tcs, tds, due_date::text, at_risk, expected_lines, received_lines, issues from recon_results where order_id = ${id}`,
    sql`select o.order_id, o.channel, o.payment_mode, o.value, o.order_date::text, o.status_date::text, o.delivery_status, o.awb, o.courier, o.weight_kg, o.zone, o.customer_name_masked, o.customer_phone_masked, o.pincode, u.file_name from orders o left join uploads u on u.id = o.upload_id where o.order_id = ${id}`,
    sql`select id, partner, type, amount, status, recovered_amount, note, updated_at from claims where order_id = ${id} order by id`,
    sql`
      select 'Settlement' as kind, s.partner, s.settlement_date::text as date, s.net + s.tcs + s.tds as amount, coalesce(s.settlement_ref, '') as ref, u.file_name, s.linked_order_id is not null as linked from settlements s left join uploads u on u.id = s.upload_id where coalesce(s.linked_order_id, s.order_id) = ${id}
      union all
      select 'COD remittance', c.partner, c.remittance_date::text, c.remitted, coalesce(c.utr, ''), u.file_name, c.linked_order_id is not null from cod_remittances c left join uploads u on u.id = c.upload_id join orders o on o.order_id = ${id} where coalesce(c.linked_order_id, c.order_id) = ${id} or (c.awb = o.awb and c.order_id is null)
      union all
      select 'Freight invoice', f.partner, f.invoice_date::text, -f.total, coalesce(f.invoice_no, '') || ' · ' || coalesce(f.billed_weight_kg::text, '?') || ' kg billed', u.file_name, f.linked_order_id is not null from freight_lines f left join uploads u on u.id = f.upload_id join orders o on o.order_id = ${id} where coalesce(f.linked_order_id, f.order_id) = ${id} or (f.awb = o.awb)
      union all
      select 'Warehouse scan', 'WH', w.scanned_at::text, null, coalesce(w.condition, ''), u.file_name, w.linked_order_id is not null from return_scans w left join uploads u on u.id = w.upload_id join orders o on o.order_id = ${id} where coalesce(w.linked_order_id, w.order_id) = ${id} or (w.awb = o.awb)
      order by 3`,
  ]);
  if (!o) return null;
  return { r: (r as OrderDetail["r"]) ?? null, o: o as OrderDetail["o"], claims: claims as unknown as OrderDetail["claims"], sources: sources.map((s) => ({ ...s, amount: s.amount === null ? null : Number(s.amount) })) as OrderDetail["sources"] };
}
