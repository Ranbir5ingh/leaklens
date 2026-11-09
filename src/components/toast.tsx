"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cx } from "./ui";

type ToastMsg = { id: number; ok: boolean; message: string };
const EVENT = "ll:toast";

/** Fire-and-forget notice that survives the component that raised it being re-rendered away. */
export function toast(ok: boolean, message: string) {
  window.dispatchEvent(new CustomEvent<Omit<ToastMsg, "id">>(EVENT, { detail: { ok, message } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<Omit<ToastMsg, "id">>).detail;
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { id, ...d }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.ok ? 5000 : 9000);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role="status" className={cx("pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border bg-ink px-4 py-3 text-sm text-white shadow-xl", t.ok ? "border-ink" : "border-loss")}>
          {t.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#9fc7a8]" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0a597]" />}
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Dismiss" className="text-white/60 hover:text-white" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
