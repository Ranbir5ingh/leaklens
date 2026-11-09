import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { sql } from "@/db";
import type { RateCard } from "@/lib/domain/ratecards";
import { formatINR } from "@/lib/domain/money";
import { Badge, Card, fmtDateTime, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { rateCardSummary as summary } from "@/lib/labels";

export const metadata: Metadata = { title: "Rate cards" };

export default async function RateCardsPage() {
  await requireUser();
  const rows = await sql<{ code: string; name: string; version: number; card: RateCard; created_at: Date; by: string | null; gaps: number; gap_amount: number }[]>`
    with gaps as (
      select i->>'partner' as partner, count(*)::int as gaps, sum((i->>'amount')::int)::bigint::int as gap_amount
      from recon_results, jsonb_array_elements(issues) i where i->>'type' in ('short_paid', 'freight_overcharged') group by 1)
    select p.code, p.name, r.version, r.card, r.created_at, u.name as by, coalesce(g.gaps, 0) as gaps, coalesce(g.gap_amount, 0) as gap_amount
    from rate_cards r join partners p on p.code = r.partner_code left join users u on u.id = r.created_by left join gaps g on g.partner = p.code
    where r.is_active order by p.code`;
  const groups: [string, RateCard["kind"]][] = [["Sales channels", "channel"], ["Payment gateway", "gateway"], ["Couriers", "courier"]];
  return (
    <>
      <PageHeader title="Rate cards" subtitle="The contract terms each partner's payouts and invoices are checked against. Any gap over ₹10 between what the card says and what was paid or billed is flagged." />
      <div className="space-y-6">
        {groups.map(([title, kind]) => (
          <section key={kind}>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {rows.filter((r) => r.card.kind === kind).map((r) => (
                <Link key={r.code} href={`/rate-cards/${r.code}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.name} <Badge className="ml-1">v{r.version}</Badge></div>
                    <div className="truncate text-xs text-muted">{summary(r.card)}</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    {r.gaps > 0 ? (
                      <>
                        <div className="num text-sm font-medium text-loss">{formatINR(r.gap_amount)}</div>
                        <div className="text-xs text-muted">{r.gaps} order{r.gaps > 1 ? "s" : ""} off the card</div>
                      </>
                    ) : <div className="text-xs text-muted">No gaps over ₹10</div>}
                  </div>
                  <div className="hidden w-40 text-right text-xs text-muted lg:block">{fmtDateTime(r.created_at)}</div>
                  <ChevronRight className="h-4 w-4 text-faint" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
