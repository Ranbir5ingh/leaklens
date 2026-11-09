"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/db";
import { requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";

const schema = z.object({ versionId: z.number().int().positive() });

/** Rollback never rewrites history: it copies an old version forward as a new active version. */
export async function rollbackMapping(input: z.infer<typeof schema>): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requirePermission("mapping.rollback");
    const { versionId } = schema.parse(input);
    const res = await sql.begin(async (tx) => {
      const [old] = await tx<{ id: number; source_id: number; version: number; is_active: boolean }[]>`select id, source_id, version, is_active from mapping_versions where id = ${versionId} for update`;
      if (!old) throw new Error("Version not found");
      if (old.is_active) throw new Error("That version is already active");
      await tx`select pg_advisory_xact_lock(${old.source_id})`;
      const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version), 0) + 1 as next from mapping_versions where source_id = ${old.source_id}`;
      await tx`update mapping_versions set is_active = false where source_id = ${old.source_id} and is_active`;
      await tx`insert into mapping_versions (source_id, version, mapping, headers, header_signature, engine, model, note, is_active, created_by)
        select source_id, ${next}, mapping, headers, header_signature, 'rollback', null, ${`Rolled back to v${old.version}`}, true, ${user.id} from mapping_versions where id = ${old.id}`;
      await audit(tx as never, user.id, "mapping.rollback", "source", old.source_id, { from: old.version, newVersion: next });
      return { sourceId: old.source_id, from: old.version, next };
    });
    revalidatePath(`/mappings/${res.sourceId}`);
    revalidatePath("/mappings");
    return { ok: true, message: `Rolled back: v${res.next} is now active (a copy of v${res.from}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Rollback failed" };
  }
}
