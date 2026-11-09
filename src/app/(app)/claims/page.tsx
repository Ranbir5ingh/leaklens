import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { CLAIM_STATUS, type ClaimStatus } from "@/lib/claims";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { formatINR, formatINRCompact } from "@/lib/domain/money";
import { can } from "@/lib/permissions";
import { Card, cx, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Pager } from "@/components/pager";
import { FilterSelect } from "@/components/filter-select";
import { requireUser } from "@/server/auth";
import { claimFilterSchema, listClaims, partnerClaimSummary } from "@/server/claims-query";
import { partnerNames } from "@/server/queries";
import { todayIST } from "@/server/recon";
import { dayNumber } from "@/lib/domain/dates";
import { ClaimsTable } from "./claims-table";
import { ClaimActions } from "./claim-actions";
import { loadClaim } from "@/server/claims-query";
import { loadOrderDetail } from "@/server/order-detail";
import { Drawer } from "@/components/drawer";
import { OrderEvidence } from "@/components/orders/order-evidence";
import { Badge, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Claims" };

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "active", label: "Open + raised" },
  { key: "open", label: "Open" },
  { key: "raised", label: "Raised" },
  { key: "recovered", label: "Recovered" },
  { key: "rejected", label: "Rejected" },
  { key: "resolved", label: "Auto-resolved" },
];

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = claimFilterSchema.parse(sp);
  const [data, summary, names] = await Promise.all([listClaims(f), partnerClaimSummary(), partnerNames()]);
  const qs = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "view"));
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    return n.toString();
  };
  const listQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "view")).toString();
  const viewId = Number(sp.view) > 0 ? Math.floor(Number(sp.view)) : null;
  const [viewed, viewOrder] = viewId ? await (async () => { const c = await loadClaim(viewId); return [c, c ? await loadOrderDetail(c.claim.order_id) : null] as const; })() : [null, null];
  const closeHref = `/claims${listQs ? `?${listQs}` : ""}`;
  const exportQs = qs({});
  const today = dayNumber(todayIST());
  const activeStatus = f.status ?? "active";

  return (
    <>
      <PageHeader
        title="Claims"
        subtitle="Every short, late or overcharged order becomes a claim against the partner that owes it. Raise them on the partner's portal with the evidence pack; filing stays manual by design."
        actions={
          <>
            <LinkButton size="sm" prefetch={false} href={`/api/claims/export?format=csv&${exportQs}`}><FileDown className="h-3.5 w-3.5" /> Evidence CSV</LinkButton>
            <LinkButton size="sm" variant="primary" prefetch={false} href={`/api/claims/export?format=pdf&${exportQs}`}><FileText className="h-3.5 w-3.5" /> Evidence PDF{f.partner ? "" : " (all partners)"}</LinkButton>
          </>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {summary.map((s) => {
          const on = f.partner === s.partner;
          return (
            <Link key={s.partner} href={`/claims?${qs({ partner: on ? null : s.partner })}`} className={cx("min-w-[168px] shrink-0 rounded-xl border bg-surface p-3 transition-colors", on ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong")}>
              <div className="text-[13px] font-medium">{names[s.partner] ?? s.partner}</div>
              <div className="num mt-1 text-lg font-semibold text-loss">{formatINRCompact(Number(s.open_amt) + Number(s.raised_amt))}</div>
              <div className="num text-xs text-muted">{s.open_n} open · {s.raised_n} raised · {formatINRCompact(Number(s.recovered_amt))} back</div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {STATUS_TABS.map((t) => (
            <Link key={t.key} href={`/claims?${qs({ status: t.key === "active" ? null : t.key })}`} aria-current={activeStatus === t.key ? "page" : undefined} className={cx("inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px]", activeStatus === t.key ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken")}>
              {t.label}
            </Link>
          ))}
        </div>
        <FilterSelect param="type" label="Issue type" options={[{ value: "", label: "All issue types" }, ...(["unpaid_past_due", "short_paid", "freight_overcharged", "return_not_received"] as ReconStatus[]).map((t) => ({ value: t, label: STATUS_LABEL[t] }))]} />
      </div>

      <div className="mt-4 text-sm text-muted">
        <span className="num font-medium text-ink">{data.total.toLocaleString("en-IN")}</span> claims · <span className="num font-medium text-ink">{formatINR(data.amount)}</span>
        {f.partner && <> · {names[f.partner]} <Link className="text-accent hover:underline" href={`/claims?${qs({ partner: null })}`}>show all partners</Link></>}
      </div>

      {data.rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No claims here" body={activeStatus === "active" ? "Nothing open — every order matches its rate card within ₹10." : `No ${CLAIM_STATUS[activeStatus as ClaimStatus]?.label.toLowerCase()} claims for this filter.`} />
        </div>
      ) : (
        <>
          <ClaimsTable
            listQs={listQs}
            activeId={viewId}
            canClose={can(user.role, "claims.close")}
            items={data.rows.map((r) => ({ id: r.id, partnerName: names[r.partner] ?? r.partner, order_id: r.order_id, type: r.type, amount: r.amount, status: r.status as ClaimStatus, ageDays: r.risk_since ? Math.max(0, today - dayNumber(r.risk_since)) : null, note: r.note, updatedBy: r.updated_by_name }))}
          />
          <Pager page={data.page} pages={data.pages} basePath="/claims" query={exportQs} />
        </>
      )}
      <Card className="mt-6 p-4 text-xs text-muted">
        Statuses: {Object.values(CLAIM_STATUS).map((s) => `${s.label} — ${s.hint}`).join(" · ")}. Only the co-founder can close a claim as rejected.
      </Card>
      {viewId && (
        <Drawer closeHref={closeHref} title={`Claim #${viewId}`} expandHref={viewed ? `/orders/${encodeURIComponent(viewed.claim.order_id)}` : undefined}>
          {!viewed ? <EmptyState title="Claim not found" /> : (() => {
            const c = viewed.claim;
            const st = CLAIM_STATUS[c.status as ClaimStatus];
            const age = c.risk_since ? Math.max(0, today - dayNumber(c.risk_since)) : null;
            return (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-[12.5px] text-muted">Claim #{c.id} against {names[c.partner] ?? c.partner} <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? c.status}</Badge></div>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <div className="num text-[32px] leading-tight font-semibold tracking-[-0.02em] text-loss">{formatINR(c.amount)}</div>
                    {age !== null && <div className={cx("num text-sm", age > 30 ? "font-medium text-loss" : "text-muted")}>{age} days old</div>}
                  </div>
                  <div className="text-[13px] text-ink-2">{STATUS_LABEL[c.type as ReconStatus]} on <span className="font-mono">{c.order_id}</span>{c.recovered_amount > 0 ? ` · ${formatINR(c.recovered_amount)} recovered` : ""}</div>
                </div>
                <Card className="space-y-3 p-4">
                  <ClaimActions id={c.id} status={c.status as ClaimStatus} canClose={can(user.role, "claims.close")} canUpdate={can(user.role, "claims.update")} />
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <LinkButton size="sm" prefetch={false} href={`/api/claims/export?format=pdf&id=${c.id}`}><FileText className="h-3.5 w-3.5" /> Evidence PDF</LinkButton>
                    <LinkButton size="sm" variant="ghost" prefetch={false} href={`/api/claims/export?format=csv&id=${c.id}`}><FileDown className="h-3.5 w-3.5" /> CSV</LinkButton>
                  </div>
                </Card>
                <Card className="p-4">
                  <h3 className="text-[13px] font-semibold">Timeline</h3>
                  <ol className="mt-2.5 space-y-2.5 border-l border-line pl-4">
                    <li className="relative text-[13px]"><span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-faint" aria-hidden />Found by matching <span className="text-muted">· {fmtDateTime(c.created_at)}</span></li>
                    {viewed.events.map((e, k) => (
                      <li key={k} className="relative text-[13px]"><span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-accent" aria-hidden />{e.who ?? "System"} · {e.action.replace("claims.", "marked ")}<span className="text-muted"> · {fmtDateTime(e.at)}</span>{e.note && <div className="text-xs text-muted">“{e.note}”</div>}</li>
                    ))}
                    {c.status === "resolved" && <li className="relative text-[13px]"><span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-ok" aria-hidden />Auto-resolved by a later match <span className="text-muted">· {fmtDateTime(c.updated_at)}</span></li>}
                  </ol>
                </Card>
                {viewOrder && <OrderEvidence d={viewOrder} names={names} compact />}
              </div>
            );
          })()}
        </Drawer>
      )}
    </>
  );
}
