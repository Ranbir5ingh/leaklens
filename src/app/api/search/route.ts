import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/db";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { getCurrentUser } from "@/server/auth";

const q = z.string().trim().min(2).max(40);

/** Command-palette lookup: orders by ID or AWB, and partners by name. Masked data only. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = q.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) return NextResponse.json({ orders: [], partners: [] });
  const term = parsed.data.replace(/[%_\\]/g, "");
  const like = `%${term}%`;
  const [orders, partners] = await Promise.all([
    sql<{ order_id: string; channel: string; status: string | null; at_risk: number | null; awb: string | null }[]>`
      select o.order_id, o.channel, r.status, r.at_risk, o.awb from orders o left join recon_results r using (order_id)
      where o.order_id ilike ${like} or o.awb ilike ${like}
      order by (o.order_id ilike ${term + "%"}) desc, r.at_risk desc nulls last, o.order_id limit 8`,
    sql<{ code: string; name: string }[]>`select code, name from partners where name ilike ${like} or code ilike ${like} order by code limit 5`,
  ]);
  return NextResponse.json({
    orders: orders.map((o) => ({ id: o.order_id, channel: o.channel, awb: o.awb, status: o.status ? STATUS_LABEL[o.status as ReconStatus] ?? o.status : null, atRisk: o.at_risk ?? 0 })),
    partners,
  });
}
