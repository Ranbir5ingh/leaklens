import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/server/auth";
import { exportOrders, orderFilterSchema } from "@/server/orders-query";
import { rupeesStr, toCsv } from "@/lib/csv";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { audit } from "@/server/audit";
import { sql } from "@/db";
import { todayIST } from "@/server/recon";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requirePermission("export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const f = orderFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await exportOrders(f);
  const csv = toCsv(
    rows.map((r) => ({
      order_id: r.order_id, channel: r.channel, partner: r.partner, order_date: r.order_date, payment: r.payment_mode, delivery: r.delivery_status,
      value_inr: rupeesStr(r.value), expected_inr: rupeesStr(r.expected), received_inr: rupeesStr(r.received), difference_inr: rupeesStr(r.difference),
      tcs_inr: rupeesStr(r.tcs), tds_inr: rupeesStr(r.tds), status: STATUS_LABEL[r.status as ReconStatus] ?? r.status, at_risk_inr: rupeesStr(r.at_risk),
    })),
    ["order_id", "channel", "partner", "order_date", "payment", "delivery", "value_inr", "expected_inr", "received_inr", "difference_inr", "tcs_inr", "tds_inr", "status", "at_risk_inr"],
  );
  await audit(sql, user.id, "orders.export", "orders", null, { filter: f, rows: rows.length });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-${todayIST()}.csv"` } });
}
