"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/db";
import { requirePermission } from "@/server/auth";
import { runReconciliation } from "@/server/recon";

export async function runReconAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const u = await requirePermission("recon.run");
    const r = await runReconciliation(sql, { userId: u.id, trigger: "manual" });
    revalidatePath("/", "layout");
    return { ok: true, message: `Matched ${r.stats.reconciled.toLocaleString("en-IN")} orders in ${(r.timings.totalMs / 1000).toFixed(1)} s` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Matching failed" };
  }
}
