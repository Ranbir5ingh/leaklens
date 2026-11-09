"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, MoreHorizontal, Search, X } from "lucide-react";
import { cx } from "../ui";
import { Logo } from "../logo";
import { ALL_ITEMS, BOTTOM, NAV, activeItem, type BadgeKey, type NavItem } from "./nav-config";
import { CommandPalette, openPalette } from "./command-palette";

export interface ShellUser { name: string; roleLabel: string; canAudit: boolean }
export interface ShellProps {
  user: ShellUser;
  counts: Record<BadgeKey, number>;
  asOf: string;
  lastRunLabel: string | null;
  collapsed: boolean;
  logout: () => Promise<void>;
  children: ReactNode;
}

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function Count({ n, tone, className }: { n: number; tone: BadgeKey; className?: string }) {
  if (!n) return null;
  return <span className={cx("num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold", tone === "review" ? "bg-[#d9a441] text-[#2a2008]" : "bg-rail-2 text-rail-ink", className)}>{n > 999 ? "999+" : n}</span>;
}

function RailLink({ item, active, collapsed, count }: { item: NavItem; active: boolean; collapsed: boolean; count: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex h-9 items-center gap-2.5 rounded-lg text-[13.5px] transition-colors",
        collapsed ? "justify-center px-0" : "px-2.5",
        active ? "bg-rail-2 font-medium text-rail-ink" : "text-rail-muted hover:bg-rail-2/60 hover:text-rail-ink",
      )}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-[#8fb59a]" aria-hidden />}
      <Icon className={cx("h-[17px] w-[17px] shrink-0", active ? "text-[#a9cdb2]" : "")} aria-hidden />
      {collapsed ? (
        <>
          {count > 0 && <span className={cx("absolute top-1 right-1.5 h-2 w-2 rounded-full", item.badge === "review" ? "bg-[#d9a441]" : "bg-rail-muted")} aria-hidden />}
          <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg group-hover:block group-focus-visible:block">
            {item.label}{count ? ` · ${count}` : ""}
          </span>
          <span className="sr-only">{item.label}{count ? `, ${count} waiting` : ""}</span>
        </>
      ) : (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && <Count n={count} tone={item.badge} />}
        </>
      )}
    </Link>
  );
}

export function AppShell({ user, counts, asOf, lastRunLabel, collapsed: initialCollapsed, logout, children }: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [more, setMore] = useState(false);
  const current = activeItem(path);
  const isActive = (href: string) => current?.href === href;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `ll_rail=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };
  const visible = (i: NavItem) => !i.audit || user.canAudit;
  const sub = path !== current?.href && current ? path.slice(current.href.length + 1).split("/")[0] : null;

  return (
    <div className="min-h-dvh">
      {/* Desktop rail */}
      <aside className={cx("fixed inset-y-0 left-0 z-40 hidden flex-col bg-rail py-3 transition-[width] duration-200 lg:flex", collapsed ? "w-[68px] px-2.5" : "w-[232px] px-3")} aria-label="Main navigation">
        <div className={cx("flex h-10 items-center", collapsed ? "justify-center" : "justify-between px-1.5")}>
          <Link href="/" aria-label="LeakLens overview"><Logo tone="light" compact={collapsed} /></Link>
        </div>
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto scrollbar-none" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.label}>
              {collapsed ? <div className="mx-auto mb-1.5 h-px w-6 bg-rail-2" aria-hidden /> : <div className="mb-1 px-2.5 text-[10.5px] font-medium tracking-[0.08em] text-rail-muted/80 uppercase">{g.label}</div>}
              <div className="space-y-0.5">
                {g.items.filter(visible).map((i) => <RailLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} count={i.badge ? counts[i.badge] : 0} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-rail-2 pt-3">
          <div className={cx("flex items-center gap-2.5", collapsed ? "flex-col" : "px-1")}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9d8c9] text-[11px] font-semibold text-[#1f2420]" title={`${user.name} · ${user.roleLabel}`}>{initials(user.name)}</span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-rail-ink">{user.name}</div>
                <div className="truncate text-[11.5px] text-rail-muted">{user.roleLabel}</div>
              </div>
            )}
            <form action={logout}>
              <button type="submit" className="rounded-md p-1.5 text-rail-muted hover:bg-rail-2 hover:text-rail-ink" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
          <button type="button" onClick={toggle} className={cx("mt-2 flex h-8 w-full items-center gap-2 rounded-lg text-[12.5px] text-rail-muted hover:bg-rail-2 hover:text-rail-ink", collapsed ? "justify-center" : "px-2.5")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      <div className={cx("transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[232px]")}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="lg:hidden" aria-label="LeakLens overview"><Logo /></Link>
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] lg:flex">
              <span className="text-muted">{current ? ALL_ITEMS.find((i) => i.href === current.href)?.group : "LeakLens"}</span>
              <span className="text-faint">/</span>
              {sub ? (
                <>
                  <Link href={current!.href} className="text-muted hover:text-ink">{current!.label}</Link>
                  <span className="text-faint">/</span>
                  <span className="truncate font-medium text-ink">{sub === "new" ? "New upload" : decodeURIComponent(sub)}</span>
                </>
              ) : <span className="font-medium text-ink">{current?.label ?? ""}</span>}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openPalette} className="hidden h-8 w-[280px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-faint hover:border-line-strong md:flex" aria-label="Search orders, AWBs and pages">
                <Search className="h-3.5 w-3.5" aria-hidden /> <span className="flex-1 text-left">Search order ID, AWB, page…</span>
                <kbd className="rounded border border-line bg-canvas px-1.5 text-[10.5px] text-muted">⌘K</kbd>
              </button>
              <button type="button" onClick={openPalette} className="rounded-lg p-2 text-ink-2 hover:bg-sunken md:hidden" aria-label="Search"><Search className="h-[18px] w-[18px]" /></button>
              <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted xl:inline-flex" title="Matching runs after every import, review decision and rate-card change">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> As of {asOf}{lastRunLabel ? ` · matched ${lastRunLabel}` : ""}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-7 lg:pb-12">{children}</main>
      </div>

      {/* Phone bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main navigation">
        <div className="grid grid-cols-4">
          {BOTTOM.map((href) => {
            const i = ALL_ITEMS.find((x) => x.href === href)!;
            const Icon = i.icon;
            const on = isActive(href) && !more;
            const n = i.badge ? counts[i.badge] : 0;
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} onClick={() => setMore(false)} className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px]", on ? "font-medium text-ink" : "text-muted")}>
                <span className="relative">
                  <Icon className={cx("h-5 w-5", on && "text-accent")} aria-hidden />
                  {n > 0 && <span className={cx("num absolute -top-1.5 left-3.5 rounded-full px-1 text-[9.5px] leading-[15px] font-semibold", i.badge === "review" ? "bg-[#d9a441] text-[#2a2008]" : "bg-ink text-white")}>{n > 99 ? "99+" : n}</span>}
                </span>
                {i.short ?? i.label}
                {on && <span className="absolute top-0 h-0.5 w-8 rounded-b bg-accent" aria-hidden />}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", more || (current && !BOTTOM.includes(current.href)) ? "font-medium text-ink" : "text-muted")}>
            {more ? <X className="h-5 w-5" aria-hidden /> : <MoreHorizontal className="h-5 w-5" aria-hidden />} More
          </button>
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-30 bg-ink/25 animate-fade lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-16 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-3 pb-4 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="More sections">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            {NAV.map((g) => {
              const items = g.items.filter((i) => visible(i) && !BOTTOM.includes(i.href));
              if (!items.length) return null;
              return (
                <div key={g.label} className="mb-2">
                  <div className="px-2 pt-1 pb-1 text-[10.5px] font-medium tracking-[0.08em] text-faint uppercase">{g.label}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map((i) => {
                      const Icon = i.icon;
                      return (
                        <Link key={i.href} href={i.href} onClick={() => setMore(false)} className={cx("flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm", isActive(i.href) ? "border-accent bg-accent-soft font-medium" : "border-line bg-raised")}>
                          <Icon className="h-4 w-4 text-muted" aria-hidden /> {i.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="mt-3 flex items-center gap-3 border-t border-line px-2 pt-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{initials(user.name)}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="text-xs text-muted">{user.roleLabel}</div></div>
              <form action={logout}><button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2">Sign out</button></form>
            </div>
          </div>
        </div>
      )}
      <CommandPalette canAudit={user.canAudit} />
    </div>
  );
}
