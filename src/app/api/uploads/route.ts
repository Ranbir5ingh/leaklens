import { NextResponse } from "next/server";
import { sql } from "@/db";
import { route } from "@/server/api";
import { createUploadBody } from "@/lib/upload-schemas";
import { headerSignature, validateMapping } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { audit } from "@/server/audit";

/** Step 1 of an import: (optionally) save the approved mapping as a new version, open an upload. */
export const POST = route("upload.create", async (req, user) => {
  const body = createUploadBody.parse(await req.json());
  const [src] = await sql<{ id: number; kind: FileKind }[]>`select id, kind from sources where id = ${body.sourceId}`;
  if (!src) return NextResponse.json({ error: "Unknown source" }, { status: 404 });
  const problems = validateMapping(src.kind, body.mapping, body.headers);
  if (problems.length) return NextResponse.json({ error: "Mapping is not complete", issues: problems }, { status: 422 });

  const result = await sql.begin(async (tx) => {
    let [mv] = await tx<{ id: number; version: number }[]>`select id, version from mapping_versions where source_id = ${src.id} and is_active for update`;
    if (body.mappingChanged || !mv) {
      const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version), 0) + 1 as next from mapping_versions where source_id = ${src.id}`;
      await tx`update mapping_versions set is_active = false where source_id = ${src.id}`;
      [mv] = await tx<{ id: number; version: number }[]>`insert into mapping_versions (source_id, version, mapping, headers, header_signature, engine, model, note, is_active, created_by)
        values (${src.id}, ${next}, ${JSON.stringify(body.mapping)}::text::jsonb, ${JSON.stringify(body.headers)}::text::jsonb, ${headerSignature(body.headers)}, ${body.engine === "saved" ? "manual" : body.engine}, ${body.model ?? null}, ${body.note ?? `Approved after 20-row preview of ${body.fileName}`}, true, ${user.id}) returning id, version`;
      await audit(tx as never, user.id, "mapping.approve", "mapping_version", mv.id, { sourceId: src.id, version: mv.version, engine: body.engine });
    }
    const prev = body.fileHash ? await tx<{ id: number; created_at: Date }[]>`select id, created_at from uploads where file_hash = ${body.fileHash} and source_id = ${src.id} and status = 'done' order by id desc limit 1` : [];
    const [up] = await tx<{ id: number }[]>`insert into uploads (source_id, mapping_version_id, file_name, file_hash, row_count, status, uploaded_by) values (${src.id}, ${mv.id}, ${body.fileName}, ${body.fileHash ?? null}, ${body.rowCount}, 'processing', ${user.id}) returning id`;
    return { uploadId: up.id, mappingVersion: mv.version, mappingVersionId: mv.id, previousUpload: prev[0] ?? null };
  });
  await audit(sql, user.id, "upload.start", "upload", result.uploadId, { sourceId: src.id, fileName: body.fileName, rows: body.rowCount });
  return NextResponse.json(result);
});
