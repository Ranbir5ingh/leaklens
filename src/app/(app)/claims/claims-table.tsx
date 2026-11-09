"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLAIM_STATUS, CLAIM_TRANSITIONS, type ClaimStatus } from "@/lib/claims";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { formatINR } from "@/lib/domain/money";
import { Alert, Badge, Button, Card, cx, Money, Td, Th } from "@/components/ui";
import { toast } from "@/components/toast";
import { updateClaims } from "./actions";

export interface ClaimItem {
  id: number;
  partnerName: string;
  order_id: string;
  type: string;
  amount: number;
  status: ClaimStatus;
  ageDays: number | null;
  note: string | null;
  updatedBy: string | null;
}

const ACTION_LABEL: Record<string, string> = { raised: "Mark raised", recovered: "Mark recovered", rejected: "Close as rejected", open: "Reopen" };

export function ClaimsTable({ items, canClose, listQs, activeId }: { items: ClaimItem[]; canClose: boolean; listQs: string; activeId: number | null }) {
  const viewHref = (id: number) => `/claims?${[listQs, `view=${id}`].filter(Boolean).join("&")}`;
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = items.length > 0 && sel.size === items.length;

  const act = (ids: number[], to: "open" | "raised" | "recovered" | "rejected") =>
    start(async () => {
      const r = await updateClaims({ ids, to });
      setMsg(r);
      toast(r.ok, r.message);
      if (r.ok) {
        setSel(new Set());
        router.refresh();
      }
    });
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const selAmount = items.filter((i) => sel.has(i.id)).reduce((a, i) => a + i.amount, 0);
  const allowedTargets = (s: ClaimStatus) => CLAIM_TRANSITIONS[s].filter((t) => t !== "resolved" && (t !== "rejected" || canClose)) as ("open" | "raised" | "recovered" | "rejected")[];

  return (
    <div className="mt-3 space-y-3">
      {msg && !msg.ok && <Alert tone="loss">{msg.message}</Alert>}
      <div className={cx("sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 shadow-md", sel.size === 0 && "hidden")}>
        <span className="text-sm">
          <span className="num font-medium">{sel.size}</span> selected · <span className="num">{formatINR(selAmount)}</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={pending} onClick={() => act([...sel], "raised")}>Mark raised</Button>
          <Button size="sm" disabled={pending} onClick={() => act([...sel], "recovered")}>Mark recovered</Button>
          {canClose && <Button size="sm" variant="danger" disabled={pending} onClick={() => act([...sel], "rejected")}>Close as rejected</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="max-h-[calc(100dvh-240px)] min-h-[360px] overflow-auto">
        <table className="ledger">
          <thead>
            <tr>
              <Th className="w-10">
                <input type="checkbox" aria-label="Select all on this page" checked={all} onChange={() => setSel(all ? new Set() : new Set(items.map((i) => i.id)))} className="accent-[var(--color-accent)]" />
              </Th>
              <Th>Claim</Th>
              <Th>Partner</Th>
              <Th>Issue</Th>
              <Th right>Age</Th>
              <Th right>Amount</Th>
              <Th>Status</Th>
              <Th right>Action</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} data-active={activeId === c.id || sel.has(c.id) ? "true" : undefined}>
                <Td>
                  <input type="checkbox" aria-label={`Select claim ${c.id}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--color-accent)]" />
                </Td>
                <Td>
                  <Link className="font-mono text-[12.5px] font-medium hover:underline" scroll={false} href={viewHref(c.id)}>{c.order_id}</Link>
                  <div className="text-xs text-muted">#{c.id}{c.note ? ` · ${c.note}` : ""}</div>
                </Td>
                <Td className="text-ink-2">{c.partnerName}</Td>
                <Td className="text-ink-2">{STATUS_LABEL[c.type as ReconStatus]}</Td>
                <Td right className={cx("num", (c.ageDays ?? 0) > 30 ? "font-medium text-loss" : "text-ink-2")}>{c.ageDays === null ? "—" : `${c.ageDays} d`}</Td>
                <Td right><Money paise={c.amount} className="font-semibold" /></Td>
                <Td><Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge></Td>
                <Td right>
                  <div className="flex justify-end gap-1">
                    {allowedTargets(c.status).slice(0, 2).map((t) => (
                      <Button key={t} size="sm" variant={t === "raised" ? "secondary" : "ghost"} disabled={pending} onClick={() => act([c.id], t)}>
                        {ACTION_LABEL[t]}
                      </Button>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <ul className="space-y-2 md:hidden">
        {items.map((c) => (
          <li key={c.id} className={cx("rounded-xl border border-line bg-surface p-3.5", sel.has(c.id) && "border-accent")}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`Select claim ${c.id}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 accent-[var(--color-accent)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={viewHref(c.id)} scroll={false} className="font-mono text-[13px] font-medium">{c.order_id}</Link>
                  <Money paise={c.amount} className="font-semibold" />
                </div>
                <div className="text-xs text-muted">{c.partnerName} · {STATUS_LABEL[c.type as ReconStatus]} · {c.ageDays ?? 0} d</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>
                  {allowedTargets(c.status).slice(0, 2).map((t) => (
                    <Button key={t} size="sm" disabled={pending} onClick={() => act([c.id], t)}>{ACTION_LABEL[t]}</Button>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
