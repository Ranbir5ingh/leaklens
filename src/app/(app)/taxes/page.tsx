import type { Metadata } from "next";
import { FileDown } from "lucide-react";
import { formatINR } from "@/lib/domain/money";
import { Alert, Card, cx, EmptyState, LinkButton, PageHeader, Td, Th } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { taxSummary } from "@/server/taxes-query";

export const metadata: Metadata = { title: "TCS & TDS" };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function TaxesPage() {
  await requireUser();
  const [rows, names] = await Promise.all([taxSummary(), partnerNames()]);
  const tot = rows.reduce((a, r) => ({ tcs: a.tcs + r.tcs, tds: a.tds + r.tds, etcs: a.etcs + r.expected_tcs, etds: a.etds + r.expected_tds }), { tcs: 0, tds: 0, etcs: 0, etds: 0 });
  const months = [...new Set(rows.map((r) => r.month))];
  const variance = (a: number, e: number) => {
    const d = a - e;
    return Math.abs(d) <= 1000 ? <span className="text-muted">—</span> : <span className={cx("num", d < 0 ? "text-loss" : "text-ink-2")}>{d > 0 ? "+" : "−"}{formatINR(Math.abs(d), { exact: true })}</span>;
  };
  return (
    <>
      <PageHeader
        title="TCS & TDS"
        subtitle="Tax withheld by marketplaces from your payouts. It is not lost money — it is credit you claim back — so it is shown here and never counted as leakage."
        actions={<LinkButton size="sm" prefetch={false} href="/api/taxes/export"><FileDown className="h-3.5 w-3.5" /> Export CSV</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3.5"><div className="text-xs text-muted">TCS withheld (GST)</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(tot.tcs)}</div><div className="text-xs text-muted">claim in GSTR-3B via GSTR-2A</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">TDS withheld (194-O)</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(tot.tds)}</div><div className="text-xs text-muted">check against Form 26AS</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Expected TCS at 0.5%</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(tot.etcs)}</div><div className="text-xs text-muted">difference {formatINR(tot.tcs - tot.etcs, { sign: true })}</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Expected TDS at 0.1%</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(tot.etds)}</div><div className="text-xs text-muted">difference {formatINR(tot.tds - tot.etds, { sign: true })}</div></Card>
      </div>
      <div className="mb-4"><Alert tone="info">Expected amounts assume 5% GST on home goods (assumption A7). A variance means a partner withheld more or less than the statutory rate — reconcile it with your tax advisor; the app does not file anything.</Alert></div>
      {rows.length === 0 ? (
        <EmptyState title="No tax withheld yet" body="Marketplace settlement files with TCS/TDS columns will populate this summary." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead><tr><Th>Month</Th><Th>Partner</Th><Th right>Orders</Th><Th right>Gross sales</Th><Th right>TCS</Th><Th right>vs 0.5%</Th><Th right>TDS</Th><Th right>vs 0.1%</Th></tr></thead>
            <tbody>
              {months.map((m) => {
                const list = rows.filter((r) => r.month === m);
                return list.map((r, i) => (
                  <tr key={`${m}-${r.partner}`} className={cx(i === 0 && "border-t-2 border-line-strong")}>
                    <Td className="whitespace-nowrap font-medium">{i === 0 ? monthLabel(m) : ""}</Td>
                    <Td className="text-ink-2">{names[r.partner] ?? r.partner}</Td>
                    <Td right className="num">{r.orders.toLocaleString("en-IN")}</Td>
                    <Td right className="num">{formatINR(r.gross)}</Td>
                    <Td right className="num">{formatINR(r.tcs, { exact: true })}</Td>
                    <Td right>{variance(r.tcs, r.expected_tcs)}</Td>
                    <Td right className="num">{formatINR(r.tds, { exact: true })}</Td>
                    <Td right>{variance(r.tds, r.expected_tds)}</Td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
