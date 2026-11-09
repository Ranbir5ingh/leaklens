"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, ArrowLeftRight, Banknote, Columns3, FileUp, Gauge, Inbox, Menu, PackageX, ReceiptIndianRupee, Scale, X } from "lucide-react";
import { cx } from "./ui";
import { Logo } from "./logo";

export interface NavUser {
  name: string;
  roleLabel: string;
  canAudit: boolean;
}

const ITEMS = [
  { href: "/", label: "Money at risk", icon: Gauge },
  { href: "/orders", label: "Orders", icon: ArrowLeftRight },
  { href: "/claims", label: "Claims", icon: Banknote },
  { href: "/review", label: "Review queue", icon: Inbox, badge: "review" as const },
  { href: "/returns", label: "Returns", icon: PackageX },
  { href: "/uploads", label: "Uploads", icon: FileUp },
  { href: "/mappings", label: "Column mappings", icon: Columns3 },
  { href: "/rate-cards", label: "Rate cards", icon: Scale },
  { href: "/taxes", label: "TCS & TDS", icon: ReceiptIndianRupee },
  { href: "/activity", label: "Activity log", icon: Activity, audit: true },
];

function NavLinks({ reviewCount, canAudit, onNavigate }: { reviewCount: number; canAudit: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {ITEMS.filter((i) => !i.audit || canAudit).map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-sunken",
            )}
          >
            <Icon className={cx("h-4 w-4", active ? "text-accent" : "text-muted")} aria-hidden />
            <span className="flex-1">{i.label}</span>
            {i.badge === "review" && reviewCount > 0 && <span className="num rounded-full bg-ink px-1.5 text-[11px] font-medium text-white">{reviewCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNav({ user, reviewCount, logout }: { user: NavUser; reviewCount: number; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  const userBlock = (
    <div className="border-t border-line pt-3">
      <div className="px-2.5 text-sm font-medium text-ink">{user.name}</div>
      <div className="px-2.5 text-xs text-muted">{user.roleLabel}</div>
      <form action={logout}>
        <button className="mt-2 w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-2 hover:bg-sunken" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-canvas px-3 py-4 lg:flex">
        <Link href="/" className="px-2 pb-5">
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavLinks reviewCount={reviewCount} canAudit={user.canAudit} />
        </div>
        {userBlock}
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:hidden">
        <Link href="/">
          <Logo />
        </Link>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 hover:bg-sunken" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-20 overflow-y-auto border-t border-line bg-canvas px-3 py-3 lg:hidden">
          <NavLinks reviewCount={reviewCount} canAudit={user.canAudit} onNavigate={() => setOpen(false)} />
          <div className="mt-4">{userBlock}</div>
        </div>
      )}
    </>
  );
}
