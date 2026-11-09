"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLAIM_TRANSITIONS, type ClaimStatus } from "@/lib/claims";
import { Button, inputClass, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { updateClaims } from "./actions";

const LABEL: Record<string, string> = { raised: "Mark raised", recovered: "Mark recovered", rejected: "Close as rejected", open: "Reopen" };

export function ClaimActions({ id, status, canClose, canUpdate }: { id: number; status: ClaimStatus; canClose: boolean; canUpdate: boolean }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const targets = CLAIM_TRANSITIONS[status].filter((t) => t !== "resolved" && (t !== "rejected" || canClose)) as ("open" | "raised" | "recovered" | "rejected")[];
  if (!canUpdate || targets.length === 0) return <p className="text-xs text-muted">{status === "resolved" ? "Auto-resolved: the partner's later payment or a re-match closed the gap." : "No further actions for this claim."}</p>;
  return (
    <div className="space-y-2">
      <input className={cx(inputClass, "h-8 text-[13px]")} placeholder="Note (optional) — portal ticket no., partner reply…" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Note for this change" />
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <Button key={t} size="sm" variant={t === "raised" || (t === "recovered" && status === "raised") ? "primary" : t === "rejected" ? "danger" : "secondary"} disabled={pending} onClick={() => start(async () => { const r = await updateClaims({ ids: [id], to: t, note: note || undefined }); toast(r.ok, r.message); if (r.ok) { setNote(""); router.refresh(); } })}>
            {LABEL[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}
