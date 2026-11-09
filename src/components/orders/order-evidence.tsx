import Link from "next/link";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { formatINR } from "@/lib/domain/money";
import { CLAIM_STATUS } from "@/lib/claims";
import { Alert, Badge, Card, cx, fmtDate, Money, StatusBadge } from "@/components/ui";
import type { OrderDetail } from "@/server/order-detail";

/** The evidence for one order: expected vs received line by line, issues, source rows, claims. */
export function OrderEvidence({ d, names, compact = false }: { d: OrderDetail; names: Record<string, string>; compact?: boolean }) {
  const { r, o, claims, sources } = d;
  const withNames = (s: string) => s.replace(/\b(MP[123]|QC[12]|CA[12]|PG)\b/g, (c) => names[c] ?? c);
  const two = compact ? "" : "lg:grid-cols-2";

  return (
    <div className="space-y-4">
      {r ? (
        <>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {[
              ["Expected", r.expected, false],
              ["Received", r.received, false],
              ["Difference", r.difference, true],
            ].map(([label, v, sig]) => (
              <div key={label as string} className={cx("bg-surface p-3.5", sig && (v as number) < -1000 && "bg-loss-soft")}>
                <div className="text-xs text-muted">{label as string}</div>
                <Money paise={v as number} signal={sig as boolean} sign={sig as boolean} className={cx("mt-0.5 block font-semibold tracking-[-0.02em]", compact ? "text-lg" : "text-2xl")} />
                {sig && r.due_date ? <div className="mt-0.5 text-[11.5px] text-muted">due {fmtDate(r.due_date)}</div> : null}
              </div>
            ))}
          </div>

          {r.issues.length > 0 && (
            <div className="space-y-2">
              {r.issues.map((i, k) => (
                <Alert key={k} tone={i.type === "overpaid" ? "info" : i.type === "freight_overcharged" ? "warn" : "loss"} title={`${i.type === "overpaid" ? "Paid more than expected" : STATUS_LABEL[i.type as ReconStatus]} · ${formatINR(i.amount)}${i.type !== "overpaid" ? ` · claim against ${names[i.partner] ?? i.partner}` : ""}`}>
                  {i.message}
                </Alert>
              ))}
            </div>
          )}

          <div className={cx("grid gap-4", two)}>
            <Card className="overflow-hidden">
              <h3 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">How we expected it</h3>
              <ul>
                {r.expected_lines.map((l, k) => (
                  <li key={k} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2 text-[13px] last:border-0">
                    <div><div>{l.label}</div><div className="text-xs text-muted">{l.rule}</div></div>
                    <Money paise={l.amount} sign />
                  </li>
                ))}
                <li className="flex justify-between bg-sunken/50 px-4 py-2 text-[13px] font-semibold"><span>Expected</span><Money paise={r.expected} /></li>
              </ul>
            </Card>
            <Card className="overflow-hidden">
              <h3 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">What actually arrived</h3>
              {r.received_lines.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted">Nothing has been received or billed for this order yet.</p>
              ) : (
                <ul>
                  {r.received_lines.map((l, k) => (
                    <li key={k} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2 text-[13px] last:border-0">
                      <div><div>{withNames(l.label)}</div><div className="text-xs text-muted">{[l.ref, l.date && fmtDate(l.date)].filter(Boolean).join(" · ") || "—"}</div></div>
                      <Money paise={l.amount} sign />
                    </li>
                  ))}
                  <li className="flex justify-between bg-sunken/50 px-4 py-2 text-[13px] font-semibold"><span>Received</span><Money paise={r.received} /></li>
                </ul>
              )}
              {(r.tcs > 0 || r.tds > 0) && <p className="border-t border-line px-4 py-2 text-xs text-muted">Includes <Money paise={r.tcs} /> TCS and <Money paise={r.tds} /> TDS withheld — claimable tax credits, not leakage.</p>}
            </Card>
          </div>
        </>
      ) : (
        <Alert tone="info">{o.delivery_status === "cancelled" ? "Cancelled order — nothing to reconcile." : "In transit — this order is reconciled once it is delivered or returned."}</Alert>
      )}

      <div className={cx("grid gap-4", compact ? "" : "lg:grid-cols-[1.4fr_1fr]")}>
        <Card className="overflow-hidden">
          <h3 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Source rows (evidence)</h3>
          {sources.length === 0 ? <p className="px-4 py-5 text-sm text-muted">No partner rows reference this order yet.</p> : (
            <ul>
              {sources.map((s, k) => (
                <li key={k} className="flex items-start gap-3 border-b border-line px-4 py-2 text-[13px] last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.kind} <span className="font-normal text-muted">· {fmtDate(s.date)}</span></div>
                    <div className="truncate text-xs text-muted">{names[s.partner] ?? s.partner}{s.ref ? ` · ${s.ref}` : ""} · {s.file_name ?? "—"}{s.linked ? " · linked in review" : ""}</div>
                  </div>
                  {s.amount === null ? <span className="text-faint">—</span> : <Money paise={s.amount} sign />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-[13px] font-semibold">Shipment & customer</h3>
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-muted">AWB</dt><dd className="font-mono text-[12.5px]">{o.awb ?? "—"}</dd>
              <dt className="text-muted">Courier</dt><dd>{o.courier ? names[o.courier] : "Partner-shipped"}</dd>
              <dt className="text-muted">Declared weight</dt><dd className="num">{o.weight_kg ? `${o.weight_kg} kg` : "—"}{o.zone ? ` · zone ${o.zone}` : ""}</dd>
              <dt className="text-muted">Customer</dt><dd>{o.customer_name_masked ?? "—"} · {o.customer_phone_masked ?? "—"}</dd>
              <dt className="text-muted">Pincode</dt><dd className="num">{o.pincode ?? "—"}</dd>
            </dl>
            <p className="mt-2.5 text-xs text-muted">Customer details are masked at upload (DPDP Act 2023). Addresses are never stored.</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-[13px] font-semibold">Claims</h3>
            {claims.length === 0 ? <p className="mt-2 text-sm text-muted">No claims for this order.</p> : (
              <ul className="mt-2 space-y-2">
                {claims.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link href={`/claims?status=all&view=${c.id}`} className="hover:underline">#{c.id} {STATUS_LABEL[c.type as ReconStatus]} · {names[c.partner]}</Link>
                    <span className="flex items-center gap-2"><Money paise={c.amount} /><Badge tone={CLAIM_STATUS[c.status as keyof typeof CLAIM_STATUS]?.tone ?? "neutral"}>{CLAIM_STATUS[c.status as keyof typeof CLAIM_STATUS]?.label ?? c.status}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function OrderHeading({ d, names }: { d: OrderDetail; names: Record<string, string> }) {
  const { o, r } = d;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-mono text-[20px] font-semibold tracking-[-0.01em]">{o.order_id}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {names[o.channel]} · {o.payment_mode} · <Money paise={o.value} /> · ordered {fmtDate(o.order_date)}
          {o.status_date && <> · {o.delivery_status === "delivered" ? "delivered" : "returned"} {fmtDate(o.status_date)}</>}
        </p>
      </div>
      {r ? <StatusBadge status={r.status} /> : <Badge>{o.delivery_status === "cancelled" ? "Cancelled" : "Not reconciled yet"}</Badge>}
    </div>
  );
}
