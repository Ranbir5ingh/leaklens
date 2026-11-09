import type { Metadata } from "next";
import { Download, Plus } from "lucide-react";
import { sql } from "@/db";
import { FILE_KIND_LABEL } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { Badge, Card, EmptyState, fmtDateTime, LinkButton, PageHeader, Td, Th } from "@/components/ui";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Imports" };

interface UploadRow {
  id: number;
  file_name: string;
  partner: string;
  kind: FileKind;
  version: number | null;
  row_count: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  status: string;
  by: string | null;
  created_at: Date;
}

export default async function UploadsPage() {
  await requireUser();
  const rows = await sql<UploadRow[]>`
    select u.id, u.file_name, p.name as partner, s.kind, m.version, u.row_count, u.inserted, u.duplicates, u.rejected, u.status, us.name as by, u.created_at
    from uploads u join sources s on s.id = u.source_id join partners p on p.code = s.partner_code
    left join mapping_versions m on m.id = u.mapping_version_id left join users us on us.id = u.uploaded_by
    order by u.created_at desc, u.id desc limit 200`;
  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="Every partner report brought in, with the column-mapping version used. Re-uploading the same rows never double-counts: each row is fingerprinted."
        actions={<LinkButton variant="primary" href="/uploads/new"><Plus className="h-4 w-4" /> Upload a report</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState title="No uploads yet" body="Bring in an order export, settlement, COD remittance, freight invoice or return-scan file to start matching." action={<LinkButton variant="primary" href="/uploads/new">Upload a report</LinkButton>} />
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr><Th>File</Th><Th>Partner · report</Th><Th>Mapping</Th><Th right>Rows</Th><Th right>Saved</Th><Th right>Duplicates</Th><Th right>Rejected</Th><Th>When</Th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-sunken/50">
                    <Td className="max-w-[260px] truncate font-medium">{r.file_name}{r.status !== "done" && <Badge tone="warn" className="ml-2">{r.status === "processing" ? "Incomplete" : r.status}</Badge>}</Td>
                    <Td className="text-ink-2">{r.partner} · {FILE_KIND_LABEL[r.kind]}</Td>
                    <Td>{r.version ? <Badge>v{r.version}</Badge> : "—"}</Td>
                    <Td right className="num">{r.row_count.toLocaleString("en-IN")}</Td>
                    <Td right className="num">{r.inserted.toLocaleString("en-IN")}</Td>
                    <Td right className="num text-muted">{r.duplicates.toLocaleString("en-IN")}</Td>
                    <Td right className="num">
                      {r.rejected > 0 ? (
                        <a className="inline-flex items-center gap-1 font-medium text-loss underline-offset-2 hover:underline" href={`/api/uploads/${r.id}/rejected`} title="Download rejected rows">
                          {r.rejected.toLocaleString("en-IN")} <Download className="h-3 w-3" />
                        </a>
                      ) : <span className="text-muted">0</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.created_at)}{r.by ? ` · ${r.by}` : ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-3.5">
                <div className="truncate text-sm font-medium">{r.file_name}</div>
                <div className="text-xs text-muted">{r.partner} · {FILE_KIND_LABEL[r.kind]}{r.version ? ` · mapping v${r.version}` : ""}</div>
                <div className="num mt-2 flex gap-3 text-xs">
                  <span>{r.inserted.toLocaleString("en-IN")} saved</span>
                  <span className="text-muted">{r.duplicates.toLocaleString("en-IN")} dup.</span>
                  {r.rejected > 0 ? <a className="font-medium text-loss underline" href={`/api/uploads/${r.id}/rejected`}>{r.rejected} rejected</a> : <span className="text-muted">0 rejected</span>}
                </div>
                <div className="mt-1 text-xs text-muted">{fmtDateTime(r.created_at)}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
