import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGE_BUCKETS } from "@/lib/domain/engine";
import { formatINR, formatINRCompact } from "@/lib/domain/money";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { Card, cx, EmptyState, fmtDate, fmtDateTime, LinkButton, PageHeader, Stat } from "@/components/ui";
import { RunReconButton } from "@/components/run-button";
import { headline, lastRun, partnerNames, riskByType, riskMatrix } from "@/server/queries";
import { requireUser } from "@/server/auth";
import { runReconAction } from "./actions";

export const metadata: Metadata = { title: "Money at risk" };

const TYPE_HINT: Record<string, string> = {
  unpaid_past_due: "Nothing received after the due date",
  short_paid: "Paid less than the rate card says",
  freight_overcharged: "Billed above the weight slab / rate",
  return_not_received: "Returned, but never scanned at the warehouse",
};

export default async function Dashboard() {
  await requireUser();
  const [h, run, matrix, byType, names] = await Promise.all([headline(), lastRun(), riskMatrix(), riskByType(), partnerNames()]);
  if (!run) {
    return (
      <>
        <PageHeader title="Money at risk" />
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

  return (
    <>
      <PageHeader
        title="Money at risk"
        subtitle={<>Open and raised claims across every partner, as of {fmtDate(run.as_of)}. Matching is rules-based against your rate cards; gaps of ₹10 or less are ignored.</>}
        actions={<RunReconButton action={runReconAction} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Total at risk</div>
          <div className="num mt-2 text-4xl font-semibold tracking-tight text-loss sm:text-5xl">{formatINR(atRisk)}</div>
          <div className="mt-2 text-sm text-muted">
            across <span className="num font-medium text-ink">{h.risk_orders.toLocaleString("en-IN")}</span> orders ·{" "}
            <Link className="text-accent hover:underline" href="/claims">
              open the claims list
            </Link>
          </div>
          <div className="mt-6 space-y-2.5">
            {byType.map((t) => {
              const pct = atRisk ? (Number(t.amount) / atRisk) * 100 : 0;
              return (
                <Link key={t.type} href={`/orders?status=${t.type}`} className="group block">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink group-hover:underline">{STATUS_LABEL[t.type as ReconStatus]}</span>
                    <span className="num text-ink-2">
                      {formatINRCompact(Number(t.amount))} <span className="text-muted">· {t.n.toLocaleString("en-IN")}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken">
                    <div className="h-1.5 rounded-full bg-loss/80" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{TYPE_HINT[t.type]}</div>
                </Link>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Stat label="Auto-matched rows" value={`${autoMatch.toFixed(1)}%`} hint="Target 98% · rest go to review" tone={autoMatch >= 98 ? "ok" : "neutral"} />
          <Stat label="Orders settled" value={`${h.orders ? ((h.settled / h.orders) * 100).toFixed(1) : 0}%`} hint={`${h.settled.toLocaleString("en-IN")} of ${h.orders.toLocaleString("en-IN")} · ${h.awaiting.toLocaleString("en-IN")} not yet due`} />
          <Stat label="Recovered via claims" value={formatINRCompact(Number(h.recovered))} hint="Marked recovered by finance" tone="ok" />
          <Link href="/review" className="block">
            <Stat label="Needs review" value={h.pending_review.toLocaleString("en-IN")} hint={<span className="inline-flex items-center gap-1">rows without a clear order <ArrowRight className="h-3 w-3" /></span>} />
          </Link>
          <Card className="col-span-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Tax withheld by partners</div>
                <div className="num mt-1.5 text-lg font-semibold">
                  {formatINRCompact(Number(h.tcs))} TCS · {formatINRCompact(Number(h.tds))} TDS
                </div>
                <div className="mt-0.5 text-xs text-muted">Claimable credits — counted as received, never as leakage.</div>
              </div>
              <LinkButton size="sm" href="/taxes">
                Summary
              </LinkButton>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">By partner and age</h2>
            <p className="text-xs text-muted">Age is days since the money became due (or the issue became actionable). Click a cell to see the orders.</p>
          </div>
        </div>
        {partners.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing at risk" body="Every reconciled order matches its rate card within ₹10." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface px-5 py-2.5 text-left text-xs font-medium text-muted">Partner</th>
                  {AGE_BUCKETS.map((b) => (
                    <th key={b.key} className="px-3 py-2.5 text-right text-xs font-medium text-muted">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-5 py-2.5 text-right text-xs font-medium text-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p} className="border-t border-line">
                    <td className="sticky left-0 bg-surface px-5 py-2 font-medium">
                      <Link href={`/claims?partner=${p}`} className="hover:underline">
                        {names[p] ?? p}
                      </Link>
                    </td>
                    {AGE_BUCKETS.map((b) => {
                      const c = cell(p, b.key);
                      const amt = c ? Number(c.amount) : 0;
                      const alpha = amt ? 0.06 + (amt / maxCell) * 0.34 : 0;
                      return (
                        <td key={b.key} className="px-1 py-1 text-right">
                          {c ? (
                            <Link
                              href={`/orders?risk=1&partner=${p}&age=${b.key}`}
                              className={cx("num block rounded-md px-2 py-1.5 transition-shadow hover:shadow-[0_0_0_1px_var(--color-loss-line)]", amt / maxCell > 0.55 ? "font-semibold text-loss" : "text-ink")}
                              style={{ backgroundColor: `rgba(180,35,24,${alpha.toFixed(3)})` }}
                              title={`${c.n} claims`}
                            >
                              {formatINRCompact(amt)}
                            </Link>
                          ) : (
                            <span className="block px-2 py-1.5 text-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num px-5 py-2 text-right font-semibold">{formatINRCompact(sumFor(matrix, p))}</td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong bg-sunken/50">
                  <td className="sticky left-0 bg-sunken px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted">All partners</td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b.key} className="num px-3 py-2.5 text-right font-medium">
                      {formatINRCompact(matrix.filter((m) => m.bucket === b.key).reduce((a, m) => a + Number(m.amount), 0))}
                    </td>
                  ))}
                  <td className="num px-5 py-2.5 text-right font-semibold text-loss">{formatINRCompact(atRisk)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted">
        Last matching run #{run.id} {run.trigger ? `(${run.trigger})` : ""} by {run.name ?? "system"} at {fmtDateTime(run.started_at)} —{" "}
        {stats.reconciled?.toLocaleString("en-IN")} orders in {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)} s` : "—"}
        {run.timings ? ` (load ${run.timings.loadMs} ms · match ${run.timings.matchMs} ms · write ${run.timings.writeMs} ms)` : ""}.
      </p>
    </>
  );
}

function sumFor(m: { partner: string; amount: string }[], p: string) {
  return m.filter((x) => x.partner === p).reduce((a, x) => a + Number(x.amount), 0);
}
