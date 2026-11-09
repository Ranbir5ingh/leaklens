import { sql } from "@/db";
import { AppNav } from "@/components/nav";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ n }] = await sql<{ n: number }[]>`select count(distinct (orphan_kind, orphan_row_id))::int as n from match_suggestions where status = 'pending'`;
  return (
    <div className="min-h-dvh">
      <AppNav user={{ name: user.name, roleLabel: ROLE_LABEL[user.role], canAudit: can(user.role, "audit.view") }} reviewCount={n} logout={logout} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>
      </main>
    </div>
  );
}
