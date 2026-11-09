import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/db";
import type { ExpectedLine, Issue, ReceivedLine } from "@/lib/domain/types";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { formatINR } from "@/lib/domain/money";
import { Alert, Badge, Card, fmtDate, Money, StatusBadge } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { CLAIM_STATUS } from "@/lib/claims";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).id) };
}

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = decodeURIComponent((await params).id).slice(0, 80);
  const [[r], [o], claims, sources, names] = await Promise.all([
    sql`select * from recon_results where order_id = ${id}`,
    sql`select o.*, u.file_name from orders o left join uploads u on u.id = o.upload_id where o.order_id = ${id}`,
    sql`select id, partner, type, amount, status, recovered_amount, note, updated_at from claims where order_id = ${id} order by id`,
    sql`
      select 'Settlement' as kind, s.partner, s.settlement_date::text as date, s.net + s.tcs + s.tds as amount, coalesce(s.settlement_ref, '') as ref, u.file_name, s.linked_order_id is not null as linked from settlements s left join uploads u on u.id = s.upload_id where coalesce(s.linked_order_id, s.order_id) = ${id}
      union all
      select 'COD remittance', c.partner, c.remittance_date::text, c.remitted, coalesce(c.utr, ''), u.file_name, c.linked_order_id is not null from cod_remittances c left join uploads u on u.id = c.upload_id join orders o on o.order_id = ${id} where coalesce(c.linked_order_id, c.order_id) = ${id} or (c.awb = o.awb and c.order_id is null)
      union all
      select 'Freight invoice', f.partner, f.invoice_date::text, -f.total, coalesce(f.invoice_no, '') || ' · ' || coalesce(f.billed_weight_kg::text, '?') || ' kg billed', u.file_name, f.linked_order_id is not null from freight_lines f left join uploads u on u.id = f.upload_id join orders o on o.order_id = ${id} where coalesce(f.linked_order_id, f.order_id) = ${id} or (f.awb = o.awb)
      union all
      select 'Warehouse scan', 'WH', w.scanned_at::text, null, coalesce(w.condition, ''), u.file_name, w.linked_order_id is not null from return_scans w left join uploads u on u.id = w.upload_id join orders o on o.order_id = ${id} where coalesce(w.linked_order_id, w.order_id) = ${id} or (w.awb = o.awb)
      order by 3`,
    partnerNames(),
  ]);
  if (!o) notFound();

  const withNames = (s: string) => s.replace(/\b(MP[123]|QC[12]|CA[12]|PG)\b/g, (c) => names[c] ?? c);
  const expectedLines = (r?.expected_lines ?? []) as ExpectedLine[];
  const receivedLines = (r?.received_lines ?? []) as ReceivedLine[];
  const issues = (r?.issues ?? []) as Issue[];

  return (
    <>
      <Link href="/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{o.order_id}</h1>
          <p className="mt-1 text-sm text-muted">
            {names[o.channel]} · {o.payment_mode} · <Money paise={o.value} /> · ordered {fmtDate(o.order_date)}
            {o.status_date && <> · {o.delivery_status === "delivered" ? "delivered" : "returned"} {fmtDate(o.status_date)}</>}
          </p>
        </div>
        {r ? <StatusBadge status={r.status} /> : <Badge>{o.delivery_status === "cancelled" ? "Cancelled" : "In transit — not reconciled yet"}</Badge>}
      </div>

      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted">Expected (rate card)</div>
              <Money paise={r.expected} className="mt-1 block text-2xl font-semibold" />
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted">Received</div>
              <Money paise={r.received} className="mt-1 block text-2xl font-semibold" />
            </Card>
            <Card className={r.difference < -1000 ? "border-loss-line bg-loss-soft p-4" : "p-4"}>
              <div className="text-xs text-muted">Difference</div>
              <Money paise={r.difference} signal sign className="mt-1 block text-2xl font-semibold" />
              {r.due_date && <div className="mt-0.5 text-xs text-muted">Payment due {fmtDate(r.due_date)}</div>}
            </Card>
          </div>

          {issues.length > 0 && (
            <div className="mt-4 space-y-2">
              {issues.map((i, k) => (
                <Alert key={k} tone={i.type === "overpaid" ? "info" : i.type === "freight_overcharged" ? "warn" : "loss"} title={`${i.type === "overpaid" ? "Paid more than expected" : STATUS_LABEL[i.type as ReconStatus]} · ${formatINR(i.amount)}${i.type !== "overpaid" ? ` · claim against ${names[i.partner] ?? i.partner}` : ""}`}>
                  {i.message}
                </Alert>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">How we expected it</h2>
              <ul>
                {expectedLines.map((l, k) => (
                  <li key={k} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
                    <div>
                      <div>{l.label}</div>
                      <div className="text-xs text-muted">{l.rule}</div>
                    </div>
                    <Money paise={l.amount} sign />
                  </li>
                ))}
                <li className="flex justify-between bg-sunken/60 px-4 py-2.5 text-sm font-semibold">
                  <span>Expected</span>
                  <Money paise={r.expected} />
                </li>
              </ul>
            </Card>
            <Card className="overflow-hidden">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">What actually arrived</h2>
              {receivedLines.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">Nothing has been received or billed for this order yet.</p>
              ) : (
                <ul>
                  {receivedLines.map((l, k) => (
                    <li key={k} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
                      <div>
                        <div>{withNames(l.label)}</div>
                        <div className="text-xs text-muted">{[l.ref, l.date && fmtDate(l.date)].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <Money paise={l.amount} sign />
                    </li>
                  ))}
                  <li className="flex justify-between bg-sunken/60 px-4 py-2.5 text-sm font-semibold">
                    <span>Received</span>
                    <Money paise={r.received} />
                  </li>
                </ul>
              )}
              {(r.tcs > 0 || r.tds > 0) && (
                <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
                  Includes <Money paise={r.tcs} /> TCS and <Money paise={r.tds} /> TDS withheld by the partner — claimable tax credits, not leakage.
                </p>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Source rows (evidence)</h2>
          {sources.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No partner rows reference this order yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {sources.map((s, k) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{s.kind}</div>
                        <div className="text-xs text-muted">{names[s.partner] ?? s.partner} · {s.file_name ?? "—"}{s.linked ? " · linked in review" : ""}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{s.ref}</td>
                      <td className="px-4 py-2.5 text-muted">{fmtDate(s.date)}</td>
                      <td className="px-4 py-2.5 text-right">{s.amount === null ? <span className="text-faint">—</span> : <Money paise={Number(s.amount)} sign />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Shipment & customer</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">AWB</dt>
              <dd>{o.awb ?? "—"}</dd>
              <dt className="text-muted">Courier</dt>
              <dd>{o.courier ? names[o.courier] : "Partner-shipped"}</dd>
              <dt className="text-muted">Declared weight</dt>
              <dd>{o.weight_kg ? `${o.weight_kg} kg` : "—"}</dd>
              <dt className="text-muted">Zone</dt>
              <dd>{o.zone ?? "—"}</dd>
              <dt className="text-muted">Customer</dt>
              <dd>{o.customer_name_masked ?? "—"}</dd>
              <dt className="text-muted">Phone</dt>
              <dd>{o.customer_phone_masked ?? "—"}</dd>
              <dt className="text-muted">Pincode</dt>
              <dd>{o.pincode ?? "—"}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted">Customer details are masked at upload (DPDP Act 2023). Addresses are never stored.</p>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Claims</h2>
            {claims.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No claims for this order.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {claims.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/claims?partner=${c.partner}&q=${encodeURIComponent(id)}`} className="hover:underline">
                      #{c.id} {STATUS_LABEL[c.type as ReconStatus]} · {names[c.partner]}
                    </Link>
                    <span className="flex items-center gap-2">
                      <Money paise={c.amount} />
                      <Badge tone={CLAIM_STATUS[c.status as keyof typeof CLAIM_STATUS]?.tone ?? "neutral"}>{CLAIM_STATUS[c.status as keyof typeof CLAIM_STATUS]?.label ?? c.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
