import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/pager";
import { sql } from "@/db";
import { formatINR } from "@/lib/domain/money";
import { can } from "@/lib/permissions";
import { Card, EmptyState, LinkButton, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { ReviewCard, type ReviewItem } from "./review-card";

export const metadata: Metadata = { title: "Review queue" };

const KIND_LABEL: Record<string, string> = { settlement: "Settlement line", cod: "COD remittance", freight: "Freight invoice line", returns: "Return scan" };

const PAGE = 15;
const TABS = [
  { key: "suggested", label: "Likely order found" },
  { key: "none", label: "No likely order" },
  { key: "all", label: "All" },
] as const;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "suggested";
  const page = Math.max(1, Math.min(10000, Number(sp.page) || 1));
  const rows = await sql<{ id: number; orphan_kind: string; orphan_row_id: number; partner: string | null; order_id_hint: string | null; awb: string | null; amount: number | null; orphan_date: string | null; candidate_order_id: string | null; confidence: number; reasons: string[]; o_value: number | null; o_date: string | null; o_channel: string | null; o_status: string | null; o_awb: string | null }[]>`
    select s.id, s.orphan_kind, s.orphan_row_id, s.partner, s.order_id_hint, s.awb, s.amount, s.orphan_date::text, s.candidate_order_id, s.confidence, s.reasons,
      o.value as o_value, o.order_date::text as o_date, o.channel as o_channel, r.status as o_status, o.awb as o_awb
    from match_suggestions s left join orders o on o.order_id = s.candidate_order_id left join recon_results r on r.order_id = s.candidate_order_id
    where s.status = 'pending' order by s.orphan_kind, s.orphan_row_id, s.confidence desc`;
  const [decided] = await sql<{ accepted: number; rejected: number }[]>`select count(*) filter (where status = 'accepted')::int as accepted, count(*) filter (where status = 'rejected')::int as rejected from match_suggestions where reviewed_at > now() - interval '30 days'`;
  const names = await partnerNames();

  const map = new Map<string, ReviewItem>();
  for (const r of rows) {
    const key = `${r.orphan_kind}:${r.orphan_row_id}`;
    let it = map.get(key);
    if (!it) {
      it = { key, kind: r.orphan_kind, kindLabel: KIND_LABEL[r.orphan_kind] ?? r.orphan_kind, rowId: r.orphan_row_id, partner: r.partner ? names[r.partner] ?? r.partner : "—", hint: r.order_id_hint, awb: r.awb, amount: r.amount, date: r.orphan_date, candidates: [] };
      map.set(key, it);
    }
    if (r.candidate_order_id) it.candidates.push({ suggestionId: r.id, orderId: r.candidate_order_id, confidence: r.confidence, reasons: r.reasons, value: r.o_value, date: r.o_date, channel: r.o_channel ? names[r.o_channel] ?? r.o_channel : null, status: r.o_status, awb: r.o_awb });
  }
  const items = [...map.values()].sort((a, b) => (b.candidates[0]?.confidence ?? -1) - (a.candidates[0]?.confidence ?? -1) || Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
  const withSugg = items.filter((i) => i.candidates.length > 0);
  const counts = { suggested: withSugg.length, none: items.length - withSugg.length, all: items.length };
  const filtered = tab === "suggested" ? withSugg : tab === "none" ? items.filter((i) => !i.candidates.length) : items;
  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const unlinked = items.reduce((s, i) => s + Math.abs(i.amount ?? 0), 0);
  const canDecide = can(user.role, "review.decide");

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle="Partner rows whose order ID didn't match any order. We suggest likely orders with a score and the reasons behind it — nothing is linked until a person confirms."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3.5"><div className="text-xs text-muted">Rows to review</div><div className="num mt-0.5 text-xl font-semibold">{items.length}</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Money on unlinked rows</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(unlinked)}</div></Card>
        <Card className="col-span-2 p-3.5 sm:col-span-1"><div className="text-xs text-muted">Decided, last 30 days</div><div className="num mt-0.5 text-xl font-semibold">{decided.accepted + decided.rejected}<span className="ml-1 text-xs font-normal text-muted">{decided.accepted} linked · {decided.rejected} rejected</span></div></Card>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing to review" body="Every partner row matched an order. New uploads with unknown order IDs will show up here." action={<LinkButton href="/uploads/new">Upload a report</LinkButton>} />
      ) : (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
            {TABS.map((t) => (
              <Link key={t.key} href={`/review?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
                {t.label} <span className="num text-xs text-muted">{counts[t.key]}</span>
              </Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState title={tab === "none" ? "Every row has a likely order" : "No suggested matches left"} body={tab === "none" ? "Rows with no plausible order show up here for manual linking." : "Rows without a plausible order are under “No likely order” — link them by hand or reject them."} />
          ) : (
            <div className="space-y-3">
              {shown.map((it) => <ReviewCard key={it.key} item={it} canDecide={canDecide} />)}
            </div>
          )}
          <Pager page={page} pages={pages} basePath="/review" query={`tab=${tab}`} />
        </>
      )}
    </>
  );
}

