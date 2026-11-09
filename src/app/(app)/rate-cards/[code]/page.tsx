import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/db";
import { rateCardSchema, type RateCard } from "@/lib/domain/ratecards";
import { can } from "@/lib/permissions";
import { rateCardSummary } from "@/lib/labels";
import { Badge, Card, fmtDateTime, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { RateCardEditor } from "./editor";
import { RestoreButton } from "./restore-button";

export const metadata: Metadata = { title: "Rate card" };

export default async function RateCardPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) notFound();
  const [p] = await sql<{ name: string }[]>`select name from partners where code = ${code}`;
  const versions = await sql<{ version: number; card: RateCard; note: string | null; is_active: boolean; created_at: Date; by: string | null }[]>`
    select r.version, r.card, r.note, r.is_active, r.created_at, u.name as by from rate_cards r left join users u on u.id = r.created_by where r.partner_code = ${code} order by r.version desc`;
  const active = versions.find((v) => v.is_active);
  if (!p || !active) notFound();
  const card = rateCardSchema.parse(active.card);
  const canEdit = can(user.role, "ratecard.edit");
  return (
    <>
      <Link href="/rate-cards" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Rate cards</Link>
      <PageHeader title={`${p.name} rate card`} subtitle={<>Version {active.version} · {rateCardSummary(card)}</>} />
      <RateCardEditor code={code} card={card} canEdit={canEdit} />
      <h2 className="mt-8 mb-2 text-sm font-semibold">Version history</h2>
      <Card className="divide-y divide-line">
        {versions.map((v) => (
          <div key={v.version} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">v{v.version} {v.is_active && <Badge tone="ok" className="ml-1">Active</Badge>}</div>
              <div className="truncate text-xs text-muted">{v.note ?? "—"} · {v.by ?? "system"} · {fmtDateTime(v.created_at)}</div>
              <div className="truncate text-xs text-muted">{rateCardSummary(v.card)}</div>
            </div>
            {!v.is_active && canEdit && <RestoreButton code={code} version={v.version} />}
          </div>
        ))}
      </Card>
    </>
  );
}
