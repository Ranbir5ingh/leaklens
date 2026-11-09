import { NextResponse } from "next/server";
import { sql } from "@/db";
import { rupeesStr, toCsv } from "@/lib/csv";
import { requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { partnerNames } from "@/server/queries";
import { taxSummary } from "@/server/taxes-query";
import { todayIST } from "@/server/recon";

export async function GET() {
  let user;
  try {
    user = await requirePermission("export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [rows, names] = await Promise.all([taxSummary(), partnerNames()]);
  const csv = toCsv(
    rows.map((r) => ({ month: r.month, partner: names[r.partner] ?? r.partner, partner_code: r.partner, orders: r.orders, gross_inr: rupeesStr(r.gross), tcs_inr: rupeesStr(r.tcs), tds_inr: rupeesStr(r.tds), expected_tcs_inr: rupeesStr(r.expected_tcs), expected_tds_inr: rupeesStr(r.expected_tds), tcs_variance_inr: rupeesStr(r.tcs - r.expected_tcs), tds_variance_inr: rupeesStr(r.tds - r.expected_tds) })),
    ["month", "partner", "partner_code", "orders", "gross_inr", "tcs_inr", "tds_inr", "expected_tcs_inr", "expected_tds_inr", "tcs_variance_inr", "tds_variance_inr"],
  );
  await audit(sql, user.id, "taxes.export", "taxes", null, { rows: rows.length });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tcs-tds-${todayIST()}.csv"` } });
}
