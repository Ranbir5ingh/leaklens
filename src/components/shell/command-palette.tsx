"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { formatINR } from "@/lib/domain/money";
import { cx } from "../ui";
import { ALL_ITEMS } from "./nav-config";

interface Hit { key: string; label: string; hint?: string; href: string; group: string; right?: string }

export const OPEN_PALETTE = "ll:palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE));

export function CommandPalette({ canAudit }: { canAudit: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ orders: { id: string; channel: string; awb: string | null; status: string | null; atRisk: number }[]; partners: { code: string; name: string }[] }>({ orders: [], partners: [] });
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !open && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_PALETTE, onOpen); };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (r.ok) setRemote(await r.json());
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 160);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const hits: Hit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = ALL_ITEMS.filter((i) => !i.audit || canAudit)
      .filter((i) => !term || `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(term))
      .map((i) => ({ key: `p:${i.href}`, label: i.label, hint: i.group, href: i.href, group: "Go to" }));
    const actions: Hit[] = [
      { key: "a:upload", label: "Upload a partner report", href: "/uploads/new", group: "Actions", hint: "CSV or Excel" },
      { key: "a:pdf", label: "Open claims ready to raise", href: "/claims?status=open", group: "Actions", hint: "Evidence CSV / PDF" },
      { key: "a:short", label: "Show short-paid orders", href: "/orders?status=short_paid", group: "Actions" },
      { key: "a:freight", label: "Show freight overcharges", href: "/orders?status=freight_overcharged", group: "Actions" },
    ].filter((a) => !term || a.label.toLowerCase().includes(term));
    const live = term.length >= 2;
    const orders = live ? remote.orders.map((o) => ({ key: `o:${o.id}`, label: o.id, hint: [o.status, o.awb ? `AWB ${o.awb}` : null].filter(Boolean).join(" · "), href: `/orders?view=${encodeURIComponent(o.id)}`, group: "Orders", right: o.atRisk > 0 ? formatINR(o.atRisk) : undefined })) : [];
    const partners = live ? remote.partners.map((p) => ({ key: `pt:${p.code}`, label: p.name, hint: "Claims for this partner", href: `/claims?partner=${p.code}`, group: "Partners" })) : [];
    return [...orders, ...partners, ...pages, ...actions];
  }, [q, remote, canAudit]);

  if (!open) return null;
  const go = (h: Hit) => { setOpen(false); setQ(""); router.push(h.href); };
  const groups = [...new Set(hits.map((h) => h.group))];
  const sel = Math.min(idx, Math.max(0, hits.length - 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 px-3 pt-[12vh] animate-fade" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Search and jump" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-raised shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && hits[sel]) go(hits[sel]);
            }}
            placeholder="Order ID, AWB, partner or page…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {loading && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Searching…</li>}
          {!loading && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
          {groups.map((g) => (
            <li key={g} role="presentation">
              <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{g}</div>
              <ul role="presentation">
                {hits.filter((h) => h.group === g).map((h) => {
                  const i = hits.indexOf(h);
                  return (
                    <li key={h.key} role="option" aria-selected={i === sel} onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === sel ? "bg-sunken" : "")}>
                      <span className={cx("min-w-0 flex-1 truncate", g === "Orders" && "font-mono text-[13px]")}>{h.label}</span>
                      {h.hint && <span className="hidden truncate text-xs text-muted sm:inline">{h.hint}</span>}
                      {h.right && <span className="num text-xs font-medium text-loss">{h.right}</span>}
                      {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-faint" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span><kbd className="font-sans">↑↓</kbd> move</span><span><kbd className="font-sans">↵</kbd> open</span><span className="ml-auto">⌘K / Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
