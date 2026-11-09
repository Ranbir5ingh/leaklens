import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sql } from "@/db";
import { FILE_KIND_LABEL } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";
import { can } from "@/lib/permissions";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { UploadWizard } from "./wizard";

export const metadata: Metadata = { title: "New upload" };

export default async function NewUpload() {
  const user = await requireUser();
  const rows = await sql<{ id: number; partner_code: string; name: string; kind: FileKind; version: number | null }[]>`
    select s.id, s.partner_code, p.name, s.kind, m.version from sources s join partners p on p.code = s.partner_code left join mapping_versions m on m.source_id = s.id and m.is_active order by p.code, s.kind`;
  return (
    <>
      <Link href="/uploads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Imports</Link>
      <PageHeader title="Upload a partner report" subtitle="Orders, settlements, COD remittances, freight invoices or warehouse scans — CSV or Excel, up to 2 lakh rows." />
      {can(user.role, "upload.create") ? (
        <UploadWizard sources={rows.map((r) => ({ id: r.id, partner: r.partner_code, partnerName: r.name, kind: r.kind, kindLabel: FILE_KIND_LABEL[r.kind], activeVersion: r.version }))} />
      ) : (
        <Alert tone="warn">Your role cannot upload files.</Alert>
      )}
    </>
  );
}
