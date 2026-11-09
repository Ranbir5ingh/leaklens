import { NextResponse } from "next/server";
import { sql } from "@/db";
import { route } from "@/server/api";
import { toCsv } from "@/lib/csv";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>("export", async (_req, _user, ctx) => {
  const id = Number((await ctx.params).id);
  const [up] = await sql<{ file_name: string; rejected_sample: { row: number; errors: { field: string; message: string }[] }[] | null }[]>`select file_name, rejected_sample from uploads where id = ${id}`;
  if (!up) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  const rows = (up.rejected_sample ?? []).map((r) => ({ sheet_row: r.row > 0 ? r.row : "", problems: r.errors.map((e) => e.message).join("; ") }));
  return new NextResponse(toCsv(rows, ["sheet_row", "problems"]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rejected-rows-${id}.csv"` } });
});
