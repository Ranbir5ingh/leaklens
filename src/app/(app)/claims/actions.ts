"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/db";
import { CLAIM_TRANSITIONS, type ClaimStatus } from "@/lib/claims";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";

const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  to: z.enum(["open", "raised", "recovered", "rejected"]),
  note: z.string().trim().max(300).optional(),
});

export async function updateClaims(input: z.infer<typeof schema>): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requirePermission("claims.update");
    const { ids, to, note } = schema.parse(input);
    if (to === "rejected" && !can(user.role, "claims.close")) return { ok: false, message: "Only the finance co-founder can close a claim as rejected." };
    const rows = await sql<{ id: number; status: ClaimStatus }[]>`select id, status from claims where id = any(${ids})`;
    const allowed = rows.filter((r) => CLAIM_TRANSITIONS[r.status]?.includes(to)).map((r) => r.id);
    if (!allowed.length) return { ok: false, message: `None of the selected claims can move to “${to}”.` };
    await sql`update claims set status = ${to}, updated_at = now(), updated_by = ${user.id},
      recovered_amount = case when ${to} = 'recovered' then amount when ${to} in ('open','raised') then 0 else recovered_amount end,
      note = coalesce(${note ?? null}, note) where id = any(${allowed})`;
    await audit(sql, user.id, `claims.${to}`, "claims", allowed.length === 1 ? allowed[0] : null, { ids: allowed, note });
    revalidatePath("/claims");
    revalidatePath("/");
    const skipped = ids.length - allowed.length;
    return { ok: true, message: `${allowed.length} claim${allowed.length > 1 ? "s" : ""} marked ${to}${skipped ? ` · ${skipped} skipped (not allowed from their current status)` : ""}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not update claims" };
  }
}
