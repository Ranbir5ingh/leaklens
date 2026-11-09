import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { sql } from "@/db";
import { FILE_KIND_LABEL } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { Badge, Card, fmtDateTime, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { engineLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Column mappings" };

export default async function MappingsPage() {
  await requireUser();
  const rows = await sql<{ id: number; partner: string; kind: FileKind; version: number | null; versions: number; engine: string | null; created_at: Date | null; uploads: number }[]>`
    select s.id, p.name as partner, s.kind, m.version, m.engine, m.created_at,
      (select count(*)::int from mapping_versions x where x.source_id = s.id) as versions,
      (select count(*)::int from uploads u where u.source_id = s.id) as uploads
    from sources s join partners p on p.code = s.partner_code
    left join mapping_versions m on m.source_id = s.id and m.is_active
    order by p.code, s.kind`;
  return (
    <>
      <PageHeader title="Column mappings" subtitle="One saved mapping per partner report. When a partner renames columns, the next upload proposes a new version; older versions stay for rollback." />
      <Card className="divide-y divide-line overflow-hidden">
        {rows.map((r) => (
          <Link key={r.id} href={`/mappings/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.partner} <span className="font-normal text-muted">· {FILE_KIND_LABEL[r.kind]}</span></div>
              <div className="text-xs text-muted">
                {r.version ? `Active v${r.version} · ${r.versions} version${r.versions > 1 ? "s" : ""} · ${engineLabel(r.engine)} · ${fmtDateTime(r.created_at)}` : "No mapping yet — set on first upload"}
              </div>
            </div>
            <span className="hidden text-xs text-muted sm:inline">{r.uploads} upload{r.uploads === 1 ? "" : "s"}</span>
            {r.version ? <Badge tone="ok">v{r.version}</Badge> : <Badge>none</Badge>}
            <ChevronRight className="h-4 w-4 text-faint" />
          </Link>
        ))}
      </Card>
    </>
  );
}
