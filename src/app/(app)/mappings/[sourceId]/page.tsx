import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/db";
import { FIELDS, FILE_KIND_LABEL, type ColumnMapping } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { can } from "@/lib/permissions";
import { Badge, Card, cx, fmtDateTime, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { engineLabel } from "@/lib/labels";
import { RollbackButton } from "./rollback-button";

export const metadata: Metadata = { title: "Mapping history" };

interface V { id: number; version: number; mapping: ColumnMapping; headers: string[]; engine: string; model: string | null; note: string | null; is_active: boolean; created_at: Date; by: string | null; uploads: number }

export default async function MappingDetail({ params }: { params: Promise<{ sourceId: string }> }) {
  const user = await requireUser();
  const id = Number((await params).sourceId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [src] = await sql<{ id: number; partner: string; kind: FileKind }[]>`select s.id, p.name as partner, s.kind from sources s join partners p on p.code = s.partner_code where s.id = ${id}`;
  if (!src) notFound();
  const versions = await sql<V[]>`select m.id, m.version, m.mapping, m.headers, m.engine, m.model, m.note, m.is_active, m.created_at, u.name as by,
      (select count(*)::int from uploads x where x.mapping_version_id = m.id) as uploads
    from mapping_versions m left join users u on u.id = m.created_by where m.source_id = ${id} order by m.version desc`;
  const fields = FIELDS[src.kind];
  const canRollback = can(user.role, "mapping.rollback");

  return (
    <>
      <Link href="/mappings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Column mappings</Link>
      <PageHeader title={`${src.partner} · ${FILE_KIND_LABEL[src.kind]}`} subtitle="Each row shows which column in the partner's file feeds each field. Changes from the previous version are highlighted." actions={<LinkButton href="/uploads/new" variant="primary">Upload with this mapping</LinkButton>} />
      {versions.length === 0 ? (
        <Card className="p-6 text-sm text-muted">No mapping yet. The first upload for this report will propose one.</Card>
      ) : (
        <div className="space-y-4">
          {versions.map((v, i) => {
            const prev = versions[i + 1];
            return (
              <Card key={v.id} className={cx("overflow-hidden", v.is_active && "border-ok-line")}>
                <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      Version {v.version} {v.is_active && <Badge tone="ok">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {engineLabel(v.engine)}{v.model ? ` (${v.model})` : ""} · {v.by ?? "system"} · {fmtDateTime(v.created_at)} · used by {v.uploads} upload{v.uploads === 1 ? "" : "s"}{v.note ? ` · ${v.note}` : ""}
                    </div>
                  </div>
                  {!v.is_active && <RollbackButton versionId={v.id} version={v.version} allowed={canRollback} />}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map((f) => {
                    const h = v.mapping.fields[f.key] ?? null;
                    const ph = prev ? prev.mapping.fields[f.key] ?? null : undefined;
                    const changed = prev !== undefined && ph !== h;
                    return (
                      <div key={f.key} className={cx("border-b border-line px-4 py-2 text-sm sm:border-r", changed && "bg-warn-soft/70")}>
                        <div className="text-xs text-muted">{f.label}</div>
                        <div className="truncate font-medium">{h ?? <span className="font-normal text-faint">not mapped</span>}</div>
                        {changed && <div className="truncate text-xs text-warn">was {ph ?? "not mapped"}</div>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
