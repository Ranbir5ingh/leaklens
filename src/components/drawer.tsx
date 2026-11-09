"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";

/** Right-side detail drawer driven by the URL (?view=…), so list filters, page and scroll survive. */
export function Drawer({ closeHref, expandHref, title, children }: { closeHref: string; expandHref?: string; title: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [closeHref, router]);
  return (
    <>
      <Link href={closeHref} scroll={false} aria-label="Close details" className="fixed inset-0 z-40 bg-ink/20 animate-fade xl:bg-ink/10" />
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col border-l border-line bg-canvas shadow-2xl outline-none animate-drawer">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{title}</span>
          {expandHref && <Link href={expandHref} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Open full page" title="Open full page"><Maximize2 className="h-4 w-4" /></Link>}
          <Link href={closeHref} scroll={false} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Close" title="Close (Esc)"><X className="h-4 w-4" /></Link>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </aside>
    </>
  );
}
