import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/db";
import { requirePermission } from "@/server/auth";
import { claimFilterSchema, claimsForExport } from "@/server/claims-query";
import { buildEvidencePdf } from "@/server/evidence-pdf";
import { partnerNames } from "@/server/queries";
import { audit } from "@/server/audit";
import { rupeesStr, toCsv } from "@/lib/csv";
import { STATUS_LABEL, type ExpectedLine, type Issue, type ReceivedLine, type ReconStatus } from "@/lib/domain/types";
import { todayIST } from "@/server/recon";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requirePermission("export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  const f = claimFilterSchema.parse(Object.fromEntries(sp));
  const limit = format === "pdf" ? 400 : 100_000;
  const rows = await claimsForExport(f, limit + 1);
  const truncated = rows.length > limit;
  const claims = rows.slice(0, limit);
  const names = await partnerNames();
  const stamp = todayIST();
  const fname = `claims-${f.partner ?? "all-partners"}-${stamp}`;
  await audit(sql, user.id, `claims.export.${format}`, "claims", null, { filter: f, rows: claims.length });

  if (format === "csv") {
    const csv = toCsv(
      claims.map((c) => ({
        claim_id: c.id,
        partner: names[c.partner] ?? c.partner,
        order_id: c.order_id,
        awb: c.awb ?? "",
        order_date: c.order_date ?? "",
        issue: STATUS_LABEL[c.type as ReconStatus] ?? c.type,
        since: c.risk_since ?? "",
        expected_inr: rupeesStr(c.expected),
        received_inr: rupeesStr(c.received),
        claim_inr: rupeesStr(c.amount),
        status: c.status,
        evidence: ((c.issues ?? []) as Issue[]).find((i) => i.type === c.type)?.message ?? "",
        expected_working: ((c.expected_lines ?? []) as ExpectedLine[]).map((l) => `${l.label} ${rupeesStr(l.amount)} (${l.rule})`).join("; "),
        received_working: ((c.received_lines ?? []) as ReceivedLine[]).map((l) => `${l.label} ${rupeesStr(l.amount)}${l.ref ? ` [${l.ref}]` : ""}${l.date ? ` ${l.date}` : ""}`).join("; "),
      })),
      ["claim_id", "partner", "order_id", "awb", "order_date", "issue", "since", "expected_inr", "received_inr", "claim_inr", "status", "evidence", "expected_working", "received_working"],
    );
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fname}.csv"` } });
  }

  if (!claims.length) return NextResponse.json({ error: "No claims match this filter" }, { status: 404 });
  const bytes = await buildEvidencePdf({ claims, partnerNames: names, generatedBy: user.name, generatedAt: stamp, truncated });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}.pdf"` } });
}
