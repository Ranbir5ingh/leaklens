import { NextResponse } from "next/server";
import { sql } from "@/db";
import { route } from "@/server/api";
import { runReconciliation } from "@/server/recon";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Close the upload and re-run matching so statuses, claims and the review queue reflect the new file. */
export const POST = route<Ctx>("upload.create", async (_req, user, ctx) => {
  const id = Number((await ctx.params).id);
  const [up] = await sql<{ id: number; status: string; uploaded_by: number }[]>`select id, status, uploaded_by from uploads where id = ${id}`;
  if (!up) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  if (up.uploaded_by !== user.id) return NextResponse.json({ error: "Not your upload" }, { status: 403 });
  const [{ before }] = await sql<{ before: string }[]>`select coalesce(sum(amount),0)::bigint as before from claims where status in ('open','raised')`;
  await sql`update uploads set status = 'done', finished_at = now() where id = ${id} and status = 'processing'`;
  const run = await runReconciliation(sql, { userId: user.id, trigger: `upload #${id}` });
  const [{ after }] = await sql<{ after: string }[]>`select coalesce(sum(amount),0)::bigint as after from claims where status in ('open','raised')`;
  const [summary] = await sql`select row_count, inserted, duplicates, rejected from uploads where id = ${id}`;
  await audit(sql, user.id, "upload.finish", "upload", id, { ...summary });
  return NextResponse.json({ upload: summary, run: { id: run.runId, timings: run.timings, byStatus: run.stats.byStatus, reconciled: run.stats.reconciled, suggestions: run.stats.suggestions }, atRiskBefore: Number(before), atRiskAfter: Number(after) });
});
