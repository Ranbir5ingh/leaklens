import type { Metadata } from "next";
import Link from "next/link";
import { formatINR } from "@/lib/domain/money";
import { Badge, Card, cx, EmptyState, fmtDate, PageHeader, Td, Th, type Tone } from "@/components/ui";
import { Pager } from "@/components/pager";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { listReturns, RETURN_STATE_LABEL, type ReturnState } from "@/server/returns-query";

export const metadata: Metadata = { title: "Returns" };

const TABS: { key: ReturnState | "all"; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "in_transit", label: "On the way" },
  { key: "received_bad", label: "Damaged / wrong" },
  { key: "received", label: "Received" },
  { key: "all", label: "All" },
];
const TONE: Record<ReturnState, Tone> = { overdue: "loss", in_transit: "neutral", received: "ok", received_bad: "warn" };
const PAGE = 50;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.state)?.key ?? "overdue") as ReturnState | "all";
  const page = Math.max(1, Math.min(10000, Number(sp.page) || 1));
  const [all, names] = await Promise.all([listReturns(), partnerNames()]);
  const count = (s: ReturnState) => all.filter((r) => r.state === s).length;
  const overdueValue = all.filter((r) => r.state === "overdue").reduce((s, r) => s + r.value, 0);
  const rows = (tab === "all" ? all : all.filter((r) => r.state === tab)).sort((a, b) => (tab === "overdue" ? b.daysLate - a.daysLate : 0));
  const pages = Math.ceil(rows.length / PAGE);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const n = (k: string) => names[k] ?? k;

  return (
    <>
      <PageHeader title="Returns" subtitle="Every RTO and customer return, tracked until the warehouse scans it in. Past the partner's receipt window, the order value becomes a claim." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3.5"><div className="text-xs text-muted">Not received, overdue</div><div className="num mt-0.5 text-xl font-semibold text-loss">{count("overdue")}</div><div className="num text-xs text-muted">{formatINR(overdueValue)} of stock</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">On the way</div><div className="num mt-0.5 text-xl font-semibold">{count("in_transit")}</div><div className="text-xs text-muted">within the window</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Damaged or wrong item</div><div className="num mt-0.5 text-xl font-semibold text-warn">{count("received_bad")}</div><div className="text-xs text-muted">check for a damage claim</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Received in good condition</div><div className="num mt-0.5 text-xl font-semibold">{count("received")}</div><div className="text-xs text-muted">of {all.length.toLocaleString("en-IN")} returns</div></Card>
      </div>
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={`/returns?state=${t.key}`} className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label} <span className="num text-xs text-muted">{t.key === "all" ? all.length : count(t.key)}</span>
          </Link>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing here" body={tab === "overdue" ? "Every return reached the warehouse within its window." : "No returns in this state."} />
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead><tr><Th>Order</Th><Th>Type</Th><Th>Channel · courier</Th><Th>Returned on</Th><Th>Receipt due</Th><Th>Warehouse scan</Th><Th right>Value</Th><Th>State</Th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.order_id} className="hover:bg-sunken/50">
                    <Td><Link href={`/orders/${encodeURIComponent(r.order_id)}`} className="font-mono text-[13px] font-medium hover:underline">{r.order_id}</Link></Td>
                    <Td className="text-ink-2">{r.delivery_status === "rto" ? "RTO" : "Customer return"}</Td>
                    <Td className="text-ink-2">{n(r.channel)}{r.courier ? ` · ${n(r.courier)}` : ""}</Td>
                    <Td className="num whitespace-nowrap text-ink-2">{fmtDate(r.status_date)}</Td>
                    <Td className="num whitespace-nowrap">{fmtDate(r.deadline)}{r.daysLate > 0 && <span className="ml-1 text-xs text-loss">{r.daysLate}d late</span>}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{r.scanned_at ? `${fmtDate(r.scanned_at)} · ${r.condition ?? "—"}` : <span className="text-faint">none</span>}</Td>
                    <Td right className="num">{formatINR(r.value)}</Td>
                    <Td><Badge tone={TONE[r.state]}>{RETURN_STATE_LABEL[r.state]}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {shown.map((r) => (
              <Link key={r.order_id} href={`/orders/${encodeURIComponent(r.order_id)}`} className="block">
                <Card className="p-3.5">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[13px] font-medium">{r.order_id}</span><span className="num text-sm font-medium">{formatINR(r.value)}</span></div>
                  <div className="mt-0.5 text-xs text-muted">{r.delivery_status === "rto" ? "RTO" : "Customer return"} · {n(r.channel)} · due {fmtDate(r.deadline)}</div>
                  <div className="mt-2"><Badge tone={TONE[r.state]}>{RETURN_STATE_LABEL[r.state]}{r.daysLate > 0 ? ` · ${r.daysLate}d` : ""}</Badge></div>
                </Card>
              </Link>
            ))}
          </div>
          <Pager page={page} pages={pages} basePath="/returns" query={`state=${tab}`} />
        </>
      )}
    </>
  );
}
