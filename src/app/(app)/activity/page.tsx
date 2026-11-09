import type { Metadata } from "next";
import { sql } from "@/db";
import { can } from "@/lib/permissions";
import { Alert, Card, EmptyState, fmtDateTime, PageHeader } from "@/components/ui";
import { Pager } from "@/components/pager";
import { FilterSelect } from "@/components/filter-select";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Activity log" };

const LABEL: Record<string, string> = {
  "auth.login": "Signed in", "auth.logout": "Signed out", "auth.login_failed": "Failed sign-in",
  "upload.start": "Started an upload", "upload.finish": "Finished an upload", "mapping.suggest": "Asked for a column mapping", "mapping.approve": "Approved a column mapping", "mapping.rollback": "Rolled back a column mapping",
  "recon.run": "Ran matching", "review.accept": "Linked a suggested match", "review.link": "Linked a row by hand", "review.reject": "Rejected suggested matches",
  "ratecard.update": "Changed a rate card", "orders.export": "Exported orders", "claims.export": "Exported claim evidence", "taxes.export": "Exported TCS/TDS",
  "claims.raised": "Marked claims raised", "claims.recovered": "Marked claims recovered", "claims.rejected": "Closed claims as rejected", "claims.open": "Re-opened claims",
};
const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  if (!can(user.role, "audit.view")) {
    return (<><PageHeader title="Activity log" /><Alert tone="warn" title="Co-founder only">The activity log is visible to the finance co-founder.</Alert></>);
  }
  const sp = await searchParams;
  const action = sp.action && /^[a-z_.]{3,40}$/.test(sp.action) ? sp.action : null;
  const page = Math.max(1, Math.min(10000, Number(sp.page) || 1));
  const [rows, [{ n }], actions] = await Promise.all([
    sql<{ id: number; action: string; entity: string; entity_id: string | null; detail: Record<string, unknown> | null; at: Date; name: string | null }[]>`
      select a.id, a.action, a.entity, a.entity_id, a.detail, a.at, u.name from audit_log a left join users u on u.id = a.user_id
      where ${action ? sql`a.action = ${action}` : sql`true`} order by a.at desc, a.id desc limit ${PAGE} offset ${(page - 1) * PAGE}`,
    sql<{ n: number }[]>`select count(*)::int as n from audit_log where ${action ? sql`action = ${action}` : sql`true`}`,
    sql<{ action: string }[]>`select distinct action from audit_log order by 1`,
  ]);
  return (
    <>
      <PageHeader title="Activity log" subtitle="Who did what, and when. Append-only: every upload, mapping, match decision, claim change, rate-card edit and export." actions={<FilterSelect param="action" label="Filter by action" options={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a.action, label: LABEL[a.action] ?? a.action }))]} />} />
      {rows.length === 0 ? <EmptyState title="No activity yet" /> : (
        <Card className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
              <div className="w-40 shrink-0 text-xs text-muted">{fmtDateTime(r.at)}</div>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{r.name ?? "System"}</span> <span className="text-ink-2">{(LABEL[r.action] ?? r.action).toLowerCase()}</span>
                {r.entity_id && <span className="text-muted"> · {r.entity} {r.entity_id}</span>}
                {r.detail && <div className="truncate font-mono text-[11.5px] text-muted">{summarise(r.detail)}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}
      <Pager page={page} pages={Math.ceil(n / PAGE)} basePath="/activity" query={action ? `action=${action}` : ""} />
    </>
  );
}

function summarise(d: Record<string, unknown>) {
  return Object.entries(d).filter(([k]) => k !== "ids" && k !== "skippedSample").map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("  ").slice(0, 220);
}
