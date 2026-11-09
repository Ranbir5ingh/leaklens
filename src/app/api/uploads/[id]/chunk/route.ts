import { NextResponse } from "next/server";
import { sql } from "@/db";
import { route } from "@/server/api";
import { chunkBody } from "@/lib/upload-schemas";
import { ingestChunk } from "@/server/ingest";
import type { ColumnMapping } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>("upload.create", async (req, user, ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad upload id" }, { status: 400 });
  const body = chunkBody.parse(await req.json());
  const [up] = await sql<{ id: number; status: string; uploaded_by: number; kind: FileKind; partner_code: string; mapping: ColumnMapping }[]>`
    select u.id, u.status, u.uploaded_by, s.kind, s.partner_code, m.mapping from uploads u join sources s on s.id = u.source_id join mapping_versions m on m.id = u.mapping_version_id where u.id = ${id}`;
  if (!up) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  if (up.status !== "processing") return NextResponse.json({ error: "This upload is already finished" }, { status: 409 });
  if (up.uploaded_by !== user.id) return NextResponse.json({ error: "Only the person who started this upload can add to it" }, { status: 403 });

  const r = await ingestChunk(sql, { kind: up.kind, partner: up.partner_code, mapping: up.mapping, uploadId: id, startRow: body.startRow, rows: body.rows });
  const sample = r.rejected.slice(0, 50);
  await sql`update uploads set inserted = inserted + ${r.inserted + r.updated}, duplicates = duplicates + ${r.duplicates}, rejected = rejected + ${r.rejected.length},
    rejected_sample = case when jsonb_array_length(coalesce(rejected_sample, '[]'::jsonb)) < 200 then coalesce(rejected_sample, '[]'::jsonb) || ${JSON.stringify(sample)}::text::jsonb else rejected_sample end
    where id = ${id}`;
  return NextResponse.json({ inserted: r.inserted, updated: r.updated, duplicates: r.duplicates, rejected: r.rejected.length, rejectedSample: sample.slice(0, 10) });
});
