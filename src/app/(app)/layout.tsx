import { cookies } from "next/headers";
import { sql } from "@/db";
import { AppShell } from "@/components/shell/app-shell";
import { Toaster } from "@/components/toast";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { todayIST } from "@/server/recon";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [[c], jar] = await Promise.all([
    sql<{ review: number; claims: number; last_run: Date | null }[]>`select
      (select count(distinct (orphan_kind, orphan_row_id))::int from match_suggestions where status = 'pending') as review,
      (select count(*)::int from claims where status = 'open') as claims,
      (select max(started_at) from recon_runs) as last_run`,
    cookies(),
  ]);
  const asOf = new Date(`${todayIST()}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const lastRunLabel = c.last_run ? new Date(c.last_run).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : null;
  return (
    <>
      <AppShell
        user={{ name: user.name, roleLabel: ROLE_LABEL[user.role], canAudit: can(user.role, "audit.view") }}
        counts={{ review: c.review, claims: c.claims }}
        asOf={asOf}
        lastRunLabel={lastRunLabel}
        collapsed={jar.get("ll_rail")?.value === "1"}
        logout={logout}
      >
        {children}
      </AppShell>
      <Toaster />
    </>
  );
}
