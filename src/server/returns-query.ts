import "server-only";
import { sql } from "@/db";
import { addDays, dayNumber } from "@/lib/domain/dates";
import { partnerKinds } from "@/lib/domain/partners";
import { loadRateCards, todayIST } from "./recon";

export type ReturnState = "overdue" | "in_transit" | "received" | "received_bad";
export const RETURN_STATE_LABEL: Record<ReturnState, string> = { overdue: "Not received — overdue", in_transit: "On the way", received: "Received", received_bad: "Received damaged / wrong item" };

export interface ReturnRow {
  order_id: string;
  channel: string;
  courier: string | null;
  awb: string | null;
  delivery_status: "rto" | "customer_return";
  status_date: string | null;
  value: number;
  scanned_at: string | null;
  condition: string | null;
  deadline: string | null;
  state: ReturnState;
  daysLate: number;
  claimPartner: string;
}

/** Every returned or RTO order with its warehouse receipt, against the partner's receipt window. */
export async function listReturns(): Promise<ReturnRow[]> {
  const [rows, scans, book] = await Promise.all([
    sql<Omit<ReturnRow, "deadline" | "state" | "daysLate" | "claimPartner" | "scanned_at" | "condition">[]>`
      select order_id, channel, courier, awb, delivery_status, status_date::text, value
      from orders where delivery_status in ('rto', 'customer_return') order by status_date desc nulls last limit 50000`,
    sql<{ order_id: string | null; awb: string | null; scanned_at: string; condition: string | null }[]>`
      select coalesce(linked_order_id, order_id) as order_id, awb, scanned_at::text, condition from return_scans order by scanned_at`,
    loadRateCards(sql),
  ]);
  // Same rule as the engine: a scan belongs to an order by order ID, else by AWB. First scan wins.
  const byOrder = new Map<string, (typeof scans)[number]>();
  const byAwb = new Map<string, (typeof scans)[number]>();
  for (const sc of scans) {
    if (sc.order_id && !byOrder.has(sc.order_id)) byOrder.set(sc.order_id, sc);
    if (sc.awb && !byAwb.has(sc.awb)) byAwb.set(sc.awb, sc);
  }
  const kinds = partnerKinds();
  const today = dayNumber(todayIST());
  return rows.map((o) => {
    const sc = byOrder.get(o.order_id) ?? (o.awb ? byAwb.get(o.awb) : undefined);
    const r = { ...o, scanned_at: sc?.scanned_at ?? null, condition: sc?.condition ?? null };
    const website = kinds[r.channel] === "website";
    const cardCode = website ? r.courier ?? "" : r.channel;
    const card = book[cardCode];
    const days = card && card.kind !== "gateway" ? card.returnReceiptDays : 14;
    const deadline = r.status_date ? addDays(r.status_date, days) : null;
    let state: ReturnState;
    if (r.scanned_at) state = r.condition && !/^good$/i.test(r.condition) ? "received_bad" : "received";
    else state = deadline && dayNumber(deadline) < today ? "overdue" : "in_transit";
    const daysLate = !r.scanned_at && deadline ? Math.max(0, today - dayNumber(deadline)) : 0;
    return { ...r, deadline, state, daysLate, claimPartner: website && r.courier ? r.courier : r.channel };
  });
}
