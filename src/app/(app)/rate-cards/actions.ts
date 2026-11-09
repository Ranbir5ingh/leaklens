"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/db";
import { rateCardSchema } from "@/lib/domain/ratecards";
import { requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { runReconciliation } from "@/server/recon";

const schema = z.object({ code: z.string().regex(/^[A-Z0-9]{2,5}$/), card: rateCardSchema, note: z.string().trim().min(3, "Say why the terms changed").max(300) });

export async function saveRateCard(input: unknown): Promise<{ ok: boolean; message: string; fieldErrors?: string[] }> {
  try {
    const user = await requirePermission("ratecard.edit");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Some values are out of range", fieldErrors: parsed.error.issues.map((i) => `${i.path.join(" › ")}: ${i.message}`) };
    const { code, card, note } = parsed.data;
    const [{ before }] = await sql<{ before: number }[]>`select coalesce(sum(at_risk), 0)::bigint::int as before from recon_results`;
    const version = await sql.begin(async (tx) => {
      const [cur] = await tx<{ card: { kind: string }; version: number }[]>`select card, version from rate_cards where partner_code = ${code} and is_active for update`;
      if (!cur) throw new Error("Unknown partner");
      if (cur.card.kind !== card.kind) throw new Error("A rate card cannot change type");
      const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version), 0) + 1 as next from rate_cards where partner_code = ${code}`;
      await tx`update rate_cards set is_active = false where partner_code = ${code}`;
      await tx`insert into rate_cards (partner_code, version, card, note, is_active, created_by) values (${code}, ${next}, ${JSON.stringify(card)}::text::jsonb, ${note}, true, ${user.id})`;
      await audit(tx as never, user.id, "ratecard.update", "rate_card", code, { from: cur.version, to: next, note });
      return next;
    });
    const run = await runReconciliation(sql, { userId: user.id, trigger: "ratecard" });
    revalidatePath("/", "layout");
    const after = run.stats.atRisk;
    return { ok: true, message: `Saved as v${version}. Matching re-ran: money at risk ₹${Math.round(before / 100).toLocaleString("en-IN")} → ₹${Math.round(after / 100).toLocaleString("en-IN")}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

const restoreSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{2,5}$/), version: z.number().int().positive() });
export async function restoreRateCard(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    await requirePermission("ratecard.edit");
    const { code, version } = restoreSchema.parse(input);
    const [old] = await sql<{ card: unknown }[]>`select card from rate_cards where partner_code = ${code} and version = ${version}`;
    if (!old) return { ok: false, message: "Version not found" };
    return saveRateCard({ code, card: old.card, note: `Restored v${version}` });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not restore" };
  }
}
