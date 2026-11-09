import { NextResponse } from "next/server";
import { sql } from "@/db";
import { route } from "@/server/api";
import { suggestBody } from "@/lib/upload-schemas";
import { suggestMapping } from "@/lib/ai/gemini-mapper";
import { FIELDS, missingMappedHeaders, type ColumnMapping } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { audit } from "@/server/audit";

/**
 * Returns the saved mapping when it still fits the file's headers; otherwise (or when asked)
 * an AI + rules suggestion. Nothing is saved here.
 */
export const POST = route("upload.create", async (req, user) => {
  const body = suggestBody.parse(await req.json());
  const [src] = await sql<{ id: number; kind: FileKind; partner_code: string }[]>`select id, kind, partner_code from sources where id = ${body.sourceId}`;
  if (!src) return NextResponse.json({ error: "Unknown source" }, { status: 404 });
  const [active] = await sql<{ id: number; version: number; mapping: ColumnMapping }[]>`select id, version, mapping from mapping_versions where source_id = ${src.id} and is_active`;
  const missing = active ? missingMappedHeaders(active.mapping, body.headers) : [];
  const fits = !!active && missing.length === 0;

  if (fits && !body.forceAI) {
    return NextResponse.json({
      kind: src.kind,
      active: { version: active.version, id: active.id },
      fits: true,
      missing: [],
      suggestion: {
        engine: "saved",
        warnings: [],
        fields: FIELDS[src.kind].map((f) => ({ field: f.key, header: active.mapping.fields[f.key] ?? null, confidence: 1, reason: `Saved mapping v${active.version}` })),
        weightUnit: active.mapping.weightUnit,
      },
    });
  }
  const t0 = Date.now();
  const suggestion = await suggestMapping(src.kind, body.headers, body.sample);
  await audit(sql, user.id, "mapping.suggest", "source", src.id, { engine: suggestion.engine, missing, ms: Date.now() - t0, warnings: suggestion.warnings });
  return NextResponse.json({ kind: src.kind, active: active ? { version: active.version, id: active.id } : null, fits: false, missing, suggestion: { ...suggestion, weightUnit: active?.mapping.weightUnit } });
});
