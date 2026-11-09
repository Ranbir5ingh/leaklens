import { BRIEF_SAMPLE_ORDER_IDS } from "@/lib/domain/partners";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { sql } from "@/db";
import { route } from "@/server/api";
import { MP1_SETTLEMENT_V2_HEADERS } from "@/lib/data/formats";
import { addDays } from "@/lib/domain/dates";
import { pctOf } from "@/lib/domain/money";
import type { ExpectedLine } from "@/lib/domain/types";
import { todayIST } from "@/server/recon";

/**
 * Sample partner files built from the live database, so uploading one visibly changes the
 * reconciliation: payouts for orders currently unpaid, scans for returns currently missing.
 * Each sample includes realistic flaws (a short payment, a missing order ID, a bad date).
 */
type Ctx = { params: Promise<{ name: string }> };

const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("-");
const r2 = (p: number) => (p / 100).toFixed(2);

export const GET = route<Ctx>("upload.create", async (_req, _user, ctx) => {
  const name = (await ctx.params).name;
  const today = todayIST();

  if (name === "mp1-settlement-new-format.csv") {
    const rows = await sql<{ order_id: string; value: number; expected: number; expected_lines: ExpectedLine[] }[]>`
      select order_id, value, expected, expected_lines from recon_results where channel = 'MP1' and status in ('unpaid_past_due','awaiting_payment') and delivery_status = 'delivered' and order_id <> all(${BRIEF_SAMPLE_ORDER_IDS}) order by order_id limit 60`;
    const H = MP1_SETTLEMENT_V2_HEADERS;
    const data = rows.map((r, i) => {
      const tcs = Math.round(pctOf(Math.round(r.value / 1.05), 0.5));
      const tds = Math.round(pctOf(Math.round(r.value / 1.05), 0.1));
      const commission = -(r.expected_lines.find((l) => l.label === "Commission")?.amount ?? 0);
      const fixed = -(r.expected_lines.find((l) => l.label.startsWith("Fixed"))?.amount ?? 0);
      const adj = i === 3 ? 4500 : 0; // one unexplained ₹45 deduction
      return {
        [H.orderId]: i === 7 ? "" : r.order_id, // one row with the order ID missing → review queue
        [H.settlementRef]: `MP1-PAY-${today.replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`,
        [H.settlementDate]: ddmmyyyy(today),
        [H.gross]: r2(r.value),
        [H.commission]: r2(commission),
        [H.fixedFee]: r2(fixed),
        [H.shippingFee]: "0.00",
        [H.otherFees]: r2(adj),
        [H.tcs]: r2(tcs),
        [H.tds]: r2(tds),
        [H.net]: r2(r.expected - tcs - tds - adj),
      };
    });
    if (!data.length) return NextResponse.json({ error: "No unpaid Marketplace 1 orders left to build a sample from" }, { status: 404 });
    return new NextResponse(Papa.unparse(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
  }

  if (name === "ca1-cod-remittance.csv") {
    const rows = await sql<{ order_id: string; awb: string; value: number; expected: number }[]>`
      select r.order_id, o.awb, r.value, r.expected from recon_results r join orders o using (order_id) where o.courier = 'CA1' and r.payment_mode = 'COD' and r.status in ('unpaid_past_due','awaiting_payment') and r.delivery_status = 'delivered' and r.order_id <> all(${BRIEF_SAMPLE_ORDER_IDS}) order by r.order_id limit 80`;
    const data = rows.map((r, i) => ({
      "AWB No": r.awb,
      "Client Order ID": i % 3 === 0 ? "" : r.order_id,
      "COD Amount": r2(r.value),
      "Remitted Amount": r2(r.expected - (i === 5 ? 20000 : 0)), // one remittance ₹200 short
      "Remitted On": i === 9 ? "31-02-2026" : ddmmyyyy(addDays(today, -1)), // one impossible date → rejected row
      "UTR No": `UTR${(73100000 + i).toString()}`,
    }));
    if (!data.length) return NextResponse.json({ error: "No unpaid COD orders left to build a sample from" }, { status: 404 });
    return new NextResponse(Papa.unparse(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
  }

  if (name === "warehouse-return-scans.xlsx") {
    const rows = await sql<{ order_id: string; awb: string | null }[]>`select r.order_id, o.awb from recon_results r join orders o using (order_id) where r.status = 'return_not_received' and r.order_id <> all(${BRIEF_SAMPLE_ORDER_IDS}) order by r.order_id limit 25`;
    const data = rows.map((r, i) => ({ "Inward Date": ddmmyyyy(addDays(today, -1)), "Order Number": r.awb && i % 2 ? "" : r.order_id, AWB: r.awb ?? "", "QC Result": i % 6 === 0 ? "Damaged" : "Good" }));
    if (!data.length) return NextResponse.json({ error: "No missing returns left to build a sample from" }, { status: 404 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Inward scans");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"` } });
  }

  return NextResponse.json({ error: "Unknown sample" }, { status: 404 });
});
