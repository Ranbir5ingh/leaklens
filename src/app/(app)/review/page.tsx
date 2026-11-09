import type { Metadata } from "next";
import { sql } from "@/db";
import { formatINR } from "@/lib/domain/money";
import { can } from "@/lib/permissions";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { partnerNames } from "@/server/queries";
import { ReviewCard, type ReviewItem } from "./review-card";

export const metadata: Metadata = { title: "Review queue" };

const KIND_LABEL: Record<string, string> = { settlement: "Settlement line", cod: "COD remittance", freight: "Freight invoice line", returns: "Return scan" };

export default async function ReviewPage() {
  const user = await requireUser();
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
  const unlinked = items.reduce((s, i) => s + Math.abs(i.amount ?? 0), 0);
  const canDecide = can(user.role, "review.decide");

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle="Partner rows whose order ID didn't match any order. We suggest likely orders with a score and the reasons behind it — nothing is linked until a person confirms."
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3.5"><div className="text-xs text-muted">Rows to review</div><div className="num mt-0.5 text-xl font-semibold">{items.length}</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Money on unlinked rows</div><div className="num mt-0.5 text-xl font-semibold">{formatINR(unlinked)}</div></Card>
        <Card className="p-3.5"><div className="text-xs text-muted">Decided, last 30 days</div><div className="num mt-0.5 text-xl font-semibold">{decided.accepted + decided.rejected}<span className="ml-1 text-xs font-normal text-muted">{decided.accepted} linked · {decided.rejected} rejected</span></div></Card>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing to review" body="Every partner row matched an order. New uploads with unknown order IDs will show up here." action={<LinkButton href="/uploads/new">Upload a report</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {items.map((it) => <ReviewCard key={it.key} item={it} canDecide={canDecide} />)}
        </div>
      )}
    </>
  );
}

