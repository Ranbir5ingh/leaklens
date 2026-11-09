"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cx, inputClass } from "./ui";

export function OrderFilters({ partners, statuses }: { partners: { code: string; name: string }[]; statuses: { key: string; label: string; n: number }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("view");
    start(() => router.push(`${path}?${next.toString()}`));
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = sp.get("status");
  const any = ["status", "partner", "q", "risk", "age", "channel"].some((k) => sp.get(k));

  return (
    <div className={cx("space-y-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip on={!active} onClick={() => set({ status: null })}>
          All
        </Chip>
        {statuses.map((s) => (
          <Chip key={s.key} on={active === s.key} onClick={() => set({ status: active === s.key ? null : s.key })}>
            {s.label} <span className="num text-muted">{s.n.toLocaleString("en-IN")}</span>
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-faint" aria-hidden />
          <input aria-label="Search order ID or AWB" className={cx(inputClass, "pl-8")} placeholder="Order ID or AWB" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Partner" className={cx(inputClass, "sm:w-56")} value={sp.get("partner") ?? ""} onChange={(e) => set({ partner: e.target.value || null })}>
          <option value="">All partners</option>
          {partners.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm">
          <input type="checkbox" checked={sp.get("risk") === "1"} onChange={(e) => set({ risk: e.target.checked ? "1" : null })} className="accent-[var(--color-accent)]" />
          Only money at risk
        </label>
        {sp.get("age") && (
          <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-sunken px-2.5 text-sm">
            Age {sp.get("age")} days
            <button aria-label="Clear age filter" onClick={() => set({ age: null })} className="rounded p-0.5 hover:bg-line">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {any && (
          <button className="h-9 px-2 text-sm text-accent hover:underline sm:ml-auto" onClick={() => { setQ(""); start(() => router.push(path)); }}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors", on ? "border-ink bg-ink text-white [&_.text-muted]:text-white/70" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken")}>
      {children}
    </button>
  );
}
