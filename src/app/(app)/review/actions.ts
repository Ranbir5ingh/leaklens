"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/db";
import { requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { runReconciliation } from "@/server/recon";

const TABLE = { settlement: "settlements", cod: "cod_remittances", freight: "freight_lines", return: "return_scans", returns: "return_scans" } as const;

const acceptSchema = z.object({ suggestionId: z.number().int().positive() });
const rejectSchema = z.object({ orphanKind: z.string().max(20), orphanRowId: z.number().int().positive(), note: z.string().trim().max(300).optional() });
const linkSchema = z.object({ orphanKind: z.string().max(20), orphanRowId: z.number().int().positive(), orderId: z.string().trim().min(3).max(60) });

type Result = { ok: boolean; message: string };

async function link(kind: string, rowId: number, orderId: string, userId: number, suggestionId: number | null) {
  const table = TABLE[kind as keyof typeof TABLE];
  if (!table) throw new Error("Unknown row type");
  await sql.begin(async (tx) => {
    const [o] = await tx`select order_id from orders where order_id = ${orderId}`;
    if (!o) throw new Error(`Order ${orderId} does not exist`);
    const updated = await tx`update ${tx(table)} set linked_order_id = ${orderId} where id = ${rowId} returning id`;
    if (!updated.length) throw new Error("That partner row no longer exists");
    if (suggestionId) await tx`update match_suggestions set status = 'accepted', reviewed_by = ${userId}, reviewed_at = now() where id = ${suggestionId}`;
    await tx`update match_suggestions set status = 'superseded', reviewed_by = ${userId}, reviewed_at = now() where orphan_kind = ${kind} and orphan_row_id = ${rowId} and status = 'pending' and id <> ${suggestionId ?? 0}`;
    await audit(tx as never, userId, suggestionId ? "review.accept" : "review.link", table, rowId, { orderId, suggestionId });
  });
}

/** A human confirms the link; only then does the row count towards the order. Never automatic. */
export async function acceptSuggestion(input: z.infer<typeof acceptSchema>): Promise<Result> {
  try {
    const user = await requirePermission("review.decide");
    const { suggestionId } = acceptSchema.parse(input);
    const [s] = await sql<{ orphan_kind: string; orphan_row_id: number; candidate_order_id: string | null; status: string }[]>`select orphan_kind, orphan_row_id, candidate_order_id, status from match_suggestions where id = ${suggestionId}`;
    if (!s || !s.candidate_order_id) return { ok: false, message: "Suggestion not found" };
    if (s.status !== "pending") return { ok: false, message: "Someone already decided this one — refresh the queue." };
    await link(s.orphan_kind, s.orphan_row_id, s.candidate_order_id, user.id, suggestionId);
    await runReconciliation(sql, { userId: user.id, trigger: "review" });
    revalidatePath("/", "layout");
    return { ok: true, message: `Linked to ${s.candidate_order_id}. Matching re-ran.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not accept" };
  }
}

export async function linkManually(input: z.infer<typeof linkSchema>): Promise<Result> {
  try {
    const user = await requirePermission("review.decide");
    const { orphanKind, orphanRowId, orderId } = linkSchema.parse(input);
    await link(orphanKind, orphanRowId, orderId, user.id, null);
    await runReconciliation(sql, { userId: user.id, trigger: "review" });
    revalidatePath("/", "layout");
    return { ok: true, message: `Linked to ${orderId}. Matching re-ran.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not link" };
  }
}

/** "None of these": every candidate is rejected; the row stays unlinked and drops out of the queue. */
export async function rejectSuggestions(input: z.infer<typeof rejectSchema>): Promise<Result> {
  try {
    const user = await requirePermission("review.decide");
    const { orphanKind, orphanRowId, note } = rejectSchema.parse(input);
    const r = await sql`update match_suggestions set status = 'rejected', reviewed_by = ${user.id}, reviewed_at = now() where orphan_kind = ${orphanKind} and orphan_row_id = ${orphanRowId} and status = 'pending' returning id`;
    if (!r.length) return { ok: false, message: "Nothing pending for that row — refresh the queue." };
    await audit(sql, user.id, "review.reject", orphanKind, orphanRowId, { suggestions: r.map((x) => x.id), note });
    revalidatePath("/", "layout");
    return { ok: true, message: "Marked as not ours to match. It stays out of the totals." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not reject" };
  }
}
