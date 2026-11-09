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

export const metadata: Metadata = { title: "Orders" };

const ORDER: ReconStatus[] = ["unpaid_past_due", "short_paid", "freight_overcharged", "return_not_received", "awaiting_payment", "settled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const sp = await searchParams;
  const f = orderFilterSchema.parse(sp);
  const [data, names, counts] = await Promise.all([listOrders(f), partnerNames(), sql<{ status: string; n: number }[]>`select status, count(*)::int as n from recon_results group by 1`]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page")).toString();

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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
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
                    <tr key={r.order_id} className="group hover:bg-sunken/50">
                      <Td>
                        <Link href={`/orders/${encodeURIComponent(r.order_id)}`} className="font-medium text-ink group-hover:text-accent group-hover:underline">
                          {r.order_id}
                        </Link>
                        <div className="text-xs text-muted">{fmtDate(r.order_date)}</div>
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
                <Link href={`/orders/${encodeURIComponent(r.order_id)}`} className="block rounded-xl border border-line bg-surface p-3.5 active:bg-sunken">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.order_id}</div>
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
    </>
  );
}
