import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AGE_BUCKETS } from "@/lib/domain/engine";
import { formatINR, formatINRCompact } from "@/lib/domain/money";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { Badge, Card, cx, EmptyState, fmtDate, fmtDateTime, LinkButton } from "@/components/ui";
import { RunReconButton } from "@/components/run-button";
import { headline, lastRun, parsePeriod, partnerNames, PERIODS, riskByType, riskMatrix, topClaims } from "@/server/queries";
import { requireUser } from "@/server/auth";
import { todayIST } from "@/server/recon";
import { dayNumber } from "@/lib/domain/dates";
import { can } from "@/lib/permissions";
import { runReconAction } from "./actions";

export const metadata: Metadata = { title: "Overview" };

const TYPE_HINT: Record<string, string> = {
  unpaid_past_due: "Nothing received after the due date",
  short_paid: "Paid less than the rate card says",
  freight_overcharged: "Billed above the weight slab or rate",
  return_not_received: "Returned, never scanned at the warehouse",
};
/** One hue family (brick → sand) so the bar reads as "components of one loss", not categories. */
const TYPE_SHADE: Record<string, string> = { unpaid_past_due: "#8f3426", return_not_received: "#b45a45", short_paid: "#cf8a6f", freight_overcharged: "#e2b89e" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const period = parsePeriod((await searchParams).period);
  const [h, run, matrix, byType, top, names] = await Promise.all([headline(period.days), lastRun(), riskMatrix(period.days), riskByType(period.days), topClaims(period.days), partnerNames()]);
  if (!run) {
    return (
      <>
        <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.02em]">Overview</h1>
        <EmptyState title="No reconciliation yet" body="Upload an orders file and at least one partner report, then run matching." action={<LinkButton variant="primary" href="/uploads/new">Upload a file</LinkButton>} />
      </>
    );
  }

  const atRisk = Number(h.at_risk);
  const partners = [...new Set(matrix.map((m) => m.partner))].sort((a, b) => sumFor(matrix, b) - sumFor(matrix, a));
  const cell = (p: string, b: string) => matrix.find((m) => m.partner === p && m.bucket === b);
  const maxCell = Math.max(1, ...matrix.map((m) => Number(m.amount)));
  const stats = (run.stats ?? {}) as { matchedPartnerRows?: number; totalPartnerRows?: number; reconciled?: number };
  const autoMatch = stats.totalPartnerRows ? (stats.matchedPartnerRows! / stats.totalPartnerRows) * 100 : 0;
  const today = dayNumber(todayIST());

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Overview</h1>
          <p className="mt-1 text-[13.5px] text-muted">Money partners owe you, order by order, as of {fmtDate(run.as_of)}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Period by order date">
            {PERIODS.map((p) => (
              <Link key={p.key} href={p.key === "all" ? "/" : `/?period=${p.key}`} aria-current={p.key === period.key ? "true" : undefined} className={cx("rounded-md px-2.5 py-1 text-[12.5px]", p.key === period.key ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-sunken")}>
                {p.label}
              </Link>
            ))}
          </div>
          {can(user.role, "recon.run") && <RunReconButton action={runReconAction} />}
        </div>
      </div>

      {/* Hero: the at-risk number, its definition, and the components behind it (ref-02). */}
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="border-b border-line p-5 sm:p-6 lg:border-r lg:border-b-0">
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              Money at risk <Badge tone="loss">{h.risk_orders.toLocaleString("en-IN")} orders</Badge>
            </div>
            <div className="num mt-2 text-[44px] leading-none font-semibold tracking-[-0.03em] text-loss sm:text-[52px]">{formatINR(atRisk)}</div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <span className="text-ink-2"><span className="num font-medium text-loss">+{formatINRCompact(Number(h.new_7d))}</span> became due in the last 7 days</span>
              <span className="text-ink-2"><span className="num font-medium">{formatINRCompact(Number(h.raised))}</span> already raised</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Open and raised claims: every gap over ₹10 between what a partner should have paid (from your rate cards) and what arrived, plus returns never received. {period.days ? `Orders placed in the last ${period.days} days.` : "All orders."} TCS/TDS is excluded.
            </p>
            <div className="mt-4 flex gap-2">
              <LinkButton size="sm" variant="primary" href="/claims?status=open">Raise claims <ArrowRight className="h-3.5 w-3.5" /></LinkButton>
              <LinkButton size="sm" href="/orders?risk=1">See orders</LinkButton>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="text-[12.5px] text-muted">What it is made of</div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
              {byType.map((t) => <div key={t.type} style={{ width: `${atRisk ? (Number(t.amount) / atRisk) * 100 : 0}%`, backgroundColor: TYPE_SHADE[t.type] }} />)}
            </div>
            <ul className="mt-4 divide-y divide-line">
              {byType.map((t) => (
                <li key={t.type}>
                  <Link href={`/orders?status=${t.type}`} className="group flex items-center gap-3 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TYPE_SHADE[t.type] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium group-hover:underline">{STATUS_LABEL[t.type as ReconStatus]}</span>
                      <span className="block truncate text-xs text-muted">{TYPE_HINT[t.type]}</span>
                    </span>
                    <span className="text-right">
                      <span className="num block text-[13.5px] font-medium">{formatINR(Number(t.amount))}</span>
                      <span className="num block text-xs text-muted">{t.n.toLocaleString("en-IN")} · {atRisk ? Math.round((Number(t.amount) / atRisk) * 100) : 0}%</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        <Kpi label="Auto-matched partner rows" value={`${autoMatch.toFixed(1)}%`} hint="Target 98% · the rest go to review" tone={autoMatch >= 98 ? "ok" : undefined} />
        <Kpi label="Orders settled" value={`${h.orders ? ((h.settled / h.orders) * 100).toFixed(1) : 0}%`} hint={`${h.settled.toLocaleString("en-IN")} of ${h.orders.toLocaleString("en-IN")} · ${h.awaiting.toLocaleString("en-IN")} not yet due`} />
        <Kpi label="Needs review" value={h.pending_review.toLocaleString("en-IN")} hint="Partner rows without a clear order" href="/review" tone={h.pending_review ? "warn" : undefined} />
        <Kpi label="TCS + TDS withheld" value={formatINRCompact(Number(h.tcs) + Number(h.tds))} hint={`${formatINRCompact(Number(h.tcs))} TCS · ${formatINRCompact(Number(h.tds))} TDS — tax credit, not leakage`} href="/taxes" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex items-end justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">By partner and age</h2>
              <p className="text-xs text-muted">Days since the money became due. Click a cell for its orders.</p>
            </div>
            <span className="hidden text-xs text-muted sm:block">Recovered so far <span className="num font-medium text-ok">{formatINRCompact(Number(h.recovered))}</span></span>
          </div>
          {partners.length === 0 ? (
            <div className="p-6"><EmptyState title="Nothing at risk" body="Every reconciled order matches its rate card within ₹10." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="text-[11.5px] text-muted">
                    <th className="sticky left-0 bg-surface px-5 py-2.5 text-left font-medium">Partner</th>
                    {AGE_BUCKETS.map((b) => <th key={b.key} className="px-3 py-2.5 text-right font-medium">{b.label}</th>)}
                    <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p} className="border-t border-line">
                      <td className="sticky left-0 bg-surface px-5 py-1.5 font-medium"><Link href={`/claims?partner=${p}`} className="hover:underline">{names[p] ?? p}</Link></td>
                      {AGE_BUCKETS.map((b) => {
                        const c = cell(p, b.key);
                        const amt = c ? Number(c.amount) : 0;
                        const alpha = amt ? 0.05 + (amt / maxCell) * 0.38 : 0;
                        return (
                          <td key={b.key} className="px-1 py-1 text-right">
                            {c ? (
                              <Link href={`/orders?risk=1&partner=${p}&age=${b.key}`} className={cx("num block rounded-md px-2 py-1.5 hover:shadow-[0_0_0_1px_var(--color-loss-line)]", amt / maxCell > 0.55 ? "font-semibold text-loss" : "text-ink")} style={{ backgroundColor: `rgba(162,64,47,${alpha.toFixed(3)})` }} title={`${c.n} claims · ${formatINR(amt)}`}>
                                {formatINRCompact(amt)}
                              </Link>
                            ) : <span className="block px-2 py-1.5 text-faint">—</span>}
                          </td>
                        );
                      })}
                      <td className="num px-5 py-1.5 text-right font-semibold">{formatINRCompact(sumFor(matrix, p))}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line-strong">
                    <td className="sticky left-0 bg-surface px-5 py-2.5 text-xs font-medium text-muted">All partners</td>
                    {AGE_BUCKETS.map((b) => <td key={b.key} className="num px-3 py-2.5 text-right font-medium">{formatINRCompact(matrix.filter((m) => m.bucket === b.key).reduce((a, m) => a + Number(m.amount), 0))}</td>)}
                    <td className="num px-5 py-2.5 text-right font-semibold text-loss">{formatINRCompact(atRisk)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Task panel: the biggest claims to raise next. */}
        <Card className="h-fit overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <h2 className="text-sm font-semibold">Biggest claims to raise</h2>
            <Link href="/claims?status=open" className="text-xs text-accent hover:underline">All open</Link>
          </div>
          {top.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No open claims.</p> : (
            <ul className="divide-y divide-line">
              {top.map((c) => {
                const age = c.risk_since ? today - dayNumber(c.risk_since) : 0;
                return (
                  <li key={c.id}>
                    <Link href={`/claims?status=open&view=${c.id}`} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-sunken/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12.5px] font-medium">{c.order_id}</span>
                        <span className="block truncate text-xs text-muted">{names[c.partner] ?? c.partner} · {STATUS_LABEL[c.type as ReconStatus]}</span>
                      </span>
                      <span className="text-right">
                        <span className="num block text-[13px] font-medium text-loss">{formatINR(c.amount)}</span>
                        <span className={cx("num block text-[11.5px]", age > 30 ? "text-loss" : "text-muted")}>{age}d</span>
                      </span>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 text-faint group-hover:text-ink" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted">
        Last matching run #{run.id}{run.trigger ? ` (${run.trigger})` : ""} by {run.name ?? "system"} at {fmtDateTime(run.started_at)} — {stats.reconciled?.toLocaleString("en-IN")} orders in {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)} s` : "—"}
        {run.timings ? ` (load ${run.timings.loadMs} ms · match ${run.timings.matchMs} ms · write ${run.timings.writeMs} ms)` : ""}.
      </p>
    </>
  );
}

function Kpi({ label, value, hint, href, tone }: { label: string; value: string; hint: string; href?: string; tone?: "ok" | "warn" }) {
  const body = (
    <div className={cx("h-full bg-surface p-4", href && "transition-colors group-hover:bg-raised")}>
      <div className="flex items-center justify-between text-[12.5px] text-muted">{label}{href && <ArrowUpRight className="h-3.5 w-3.5 text-faint group-hover:text-ink" aria-hidden />}</div>
      <div className={cx("num mt-1 text-[22px] font-semibold tracking-[-0.02em]", tone === "ok" && "text-ok", tone === "warn" && "text-warn")}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </div>
  );
  return href ? <Link href={href} className="group block">{body}</Link> : body;
}

function sumFor(m: { partner: string; amount: string }[], p: string) {
  return m.filter((x) => x.partner === p).reduce((a, x) => a + Number(x.amount), 0);
}
