import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { sql } from "@/db";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";
import { Badge, Card, EmptyState, fmtDate, LinkButton, Money, PageHeader, StatusBadge, Td, Th } from "@/components/ui";
import { OrderFilters } from "@/components/order-filters";
import { Pager } from "@/components/pager";
import { requireUser } from "@/server/auth";
import { listOrders, orderFilterSchema } from "@/server/orders-query";
import { partnerNames } from "@/server/queries";
import { formatINR } from "@/lib/domain/money";
import { Drawer } from "@/components/drawer";
import { OrderEvidence, OrderHeading } from "@/components/orders/order-evidence";
import { loadOrderDetail } from "@/server/order-detail";

export const metadata: Metadata = { title: "Orders" };

const ORDER: ReconStatus[] = ["unpaid_past_due", "short_paid", "freight_overcharged", "return_not_received", "awaiting_payment", "settled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const sp = await searchParams;
  const f = orderFilterSchema.parse(sp);
  const [data, names, counts] = await Promise.all([listOrders(f), partnerNames(), sql<{ status: string; n: number }[]>`select status, count(*)::int as n from recon_results group by 1`]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "view")).toString();
  const listQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "view")).toString();
  const view = typeof sp.view === "string" ? sp.view.slice(0, 80) : null;
  const detail = view ? await loadOrderDetail(view) : null;
  const viewHref = (id: string) => `/orders?${[listQs, `view=${encodeURIComponent(id)}`].filter(Boolean).join("&")}`;
  const closeHref = `/orders${listQs ? `?${listQs}` : ""}`;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every delivered or returned order, matched against settlements, COD remittances, freight invoices and warehouse scans. Differences over ₹10 are flagged."
        actions={
          <LinkButton href={`/api/orders/export?${qs}`} prefetch={false} size="sm">
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </LinkButton>
        }
      />
      <Suspense>
        <OrderFilters
          partners={Object.entries(names).filter(([c]) => c !== "WH").map(([code, name]) => ({ code, name }))}
          statuses={ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], n: counts.find((c) => c.status === s)?.n ?? 0 }))}
        />
      </Suspense>

      <div className="mt-4 flex items-baseline justify-between text-sm text-muted">
        <span>
          <span className="num font-medium text-ink">{data.total.toLocaleString("en-IN")}</span> orders
          {data.risk > 0 && (
            <>
              {" "}· <span className="num font-medium text-loss">{formatINR(data.risk)}</span> at risk
            </>
          )}
        </span>
        <span className="hidden sm:inline">Sorted by money at risk</span>
      </div>

      {data.rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No orders match these filters" body="Try clearing a filter or searching a different order ID." action={<LinkButton href="/orders">Clear filters</LinkButton>} />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="mt-3 hidden overflow-hidden md:block">
            <div className="max-h-[calc(100dvh-250px)] min-h-[420px] overflow-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Channel</Th>
                    <Th>Delivery</Th>
                    <Th right>Value</Th>
                    <Th right>Expected</Th>
                    <Th right>Received</Th>
                    <Th right>Difference</Th>
                    <Th>Status</Th>
                    <Th right>At risk</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.order_id} className="group relative" data-active={view === r.order_id ? "true" : undefined}>
                      <Td>
                        <Link href={viewHref(r.order_id)} scroll={false} className="font-mono text-[12.5px] font-medium text-ink after:absolute after:inset-0 group-hover:underline">
                          {r.order_id}
                        </Link>
                        <div className="text-[11.5px] text-muted">{fmtDate(r.order_date)}</div>
                      </Td>
                      <Td className="text-ink-2">
                        {names[r.channel]}
                        <div className="text-xs text-muted">{r.payment_mode}</div>
                      </Td>
                      <Td className="text-ink-2 capitalize">{r.delivery_status.replace("_", " ").replace("rto", "RTO")}</Td>
                      <Td right><Money paise={r.value} /></Td>
                      <Td right><Money paise={r.expected} /></Td>
                      <Td right><Money paise={r.received} /></Td>
                      <Td right><Money paise={r.difference} signal sign /></Td>
                      <Td><StatusBadge status={r.status} /></Td>
                      <Td right>{r.at_risk > 0 ? <Money paise={r.at_risk} className="font-semibold text-loss" /> : <span className="text-faint">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Phone cards */}
          <ul className="mt-3 space-y-2 md:hidden">
            {data.rows.map((r) => (
              <li key={r.order_id}>
                <Link href={viewHref(r.order_id)} scroll={false} className="block rounded-xl border border-line bg-surface p-3.5 active:bg-sunken">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-[13px] font-medium">{r.order_id}</div>
                      <div className="text-xs text-muted">
                        {names[r.channel]} · {r.payment_mode} · {fmtDate(r.order_date)}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-[11px] text-muted">Expected</div>
                      <Money paise={r.expected} />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">Received</div>
                      <Money paise={r.received} />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted">Difference</div>
                      <Money paise={r.difference} signal sign />
                    </div>
                  </div>
                  {r.at_risk > 0 && (
                    <div className="mt-2">
                      <Badge tone="loss">At risk {formatINR(r.at_risk)}</Badge>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={data.page} pages={data.pages} basePath="/orders" query={qs} />
        </>
      )}
      {view && (
        <Drawer closeHref={closeHref} expandHref={`/orders/${encodeURIComponent(view)}`} title={`Order ${view}`}>
          {detail ? (
            <div className="space-y-4"><OrderHeading d={detail} names={names} /><OrderEvidence d={detail} names={names} compact /></div>
          ) : <EmptyState title="Order not found" body={`No order with ID ${view}.`} />}
        </Drawer>
      )}
    </>
  );
}
