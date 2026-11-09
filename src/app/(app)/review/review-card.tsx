"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Link2, X } from "lucide-react";
import { formatINR } from "@/lib/domain/money";
import { Badge, Button, Card, cx, fmtDate, inputClass, StatusBadge } from "@/components/ui";
import { toast } from "@/components/toast";
import { acceptSuggestion, linkManually, rejectSuggestions } from "./actions";

export interface ReviewItem {
  key: string;
  kind: string;
  kindLabel: string;
  rowId: number;
  partner: string;
  hint: string | null;
  awb: string | null;
  amount: number | null;
  date: string | null;
  candidates: { suggestionId: number; orderId: string; confidence: number; reasons: string[]; value: number | null; date: string | null; channel: string | null; status: string | null; awb: string | null }[];
}

export function ReviewCard({ item, canDecide }: { item: ReviewItem; canDecide: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [orderId, setOrderId] = useState("");
  const done = msg?.ok;
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); setMsg(r); toast(r.ok, r.message); });

  return (
    <Card className={cx("overflow-hidden transition-opacity", done && "opacity-60")}>
      <div className="flex flex-col gap-1 border-b border-line bg-sunken/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted">{item.partner} · {item.kindLabel} · {fmtDate(item.date)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm">
            <span>Order ID on file: <span className="font-mono font-medium">{item.hint ?? <span className="text-loss">missing</span>}</span></span>
            {item.awb && <span className="text-muted">AWB <span className="font-mono">{item.awb}</span></span>}
          </div>
        </div>
        <div className="num text-lg font-semibold">{item.amount === null ? "—" : formatINR(item.amount, { exact: true })}</div>
      </div>

      {item.candidates.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted">No plausible order found by ID, AWB, amount or date. Ask the partner which order this is, or link it by hand.</div>
      ) : (
        <ul className="divide-y divide-line">
          {item.candidates.map((c, i) => (
            <li key={c.suggestionId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${encodeURIComponent(c.orderId)}`} className="font-mono text-sm font-medium underline-offset-2 hover:underline">{c.orderId}</Link>
                  <Conf c={c.confidence} best={i === 0} />
                  {c.status && <StatusBadge status={c.status} />}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {c.channel} · {fmtDate(c.date)} · order value {c.value === null ? "—" : formatINR(c.value)}{c.awb ? ` · AWB ${c.awb}` : ""}
                </div>
                <div className="mt-1 text-xs text-ink-2">{c.reasons.join(" · ")}</div>
              </div>
              {canDecide && !done && (
                <Button size="sm" variant={i === 0 ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => acceptSuggestion({ suggestionId: c.suggestionId }))}>
                  <Check className="h-3.5 w-3.5" /> Link to this order
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canDecide && !done && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-2.5 sm:flex-row sm:items-center">
          {manual ? (
            <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (orderId.trim()) run(() => linkManually({ orphanKind: item.kind, orphanRowId: item.rowId, orderId: orderId.trim() })); }}>
              <input autoFocus className={cx(inputClass, "h-8 max-w-xs font-mono text-[13px]")} placeholder="ORD-…" value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="Order ID to link" />
              <Button size="sm" type="submit" disabled={pending || !orderId.trim()}>Link</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setManual(false)}>Cancel</Button>
            </form>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setManual(true)}><Link2 className="h-3.5 w-3.5" /> Link a different order</Button>
          )}
          <Button size="sm" variant="ghost" className="sm:ml-auto" disabled={pending} onClick={() => run(() => rejectSuggestions({ orphanKind: item.kind, orphanRowId: item.rowId }))}>
            <X className="h-3.5 w-3.5" /> {item.candidates.length ? "None of these" : "Dismiss"}
          </Button>
        </div>
      )}
      {(pending || msg) && (
        <div className={cx("border-t border-line px-4 py-2 text-sm", pending ? "text-muted" : msg?.ok ? "text-ok" : "text-loss")} role="status">
          {pending ? "Saving and re-running matching…" : msg?.message}
        </div>
      )}
    </Card>
  );
}

function Conf({ c, best }: { c: number; best: boolean }) {
  const pct = Math.round(c * 100);
  return <Badge tone={c >= 0.85 ? "ok" : c >= 0.6 ? "warn" : "neutral"}>{pct}% match{best && c >= 0.85 ? " · likely" : ""}</Badge>;
}
