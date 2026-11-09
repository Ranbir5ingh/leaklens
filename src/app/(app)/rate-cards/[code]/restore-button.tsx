"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { restoreRateCard } from "../actions";

export function RestoreButton({ code, version }: { code: string; version: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <Button size="sm" disabled={pending} onClick={() => { if (confirm(`Restore v${version} as a new version and re-run matching?`)) start(async () => setMsg(await restoreRateCard({ code, version }))); }}>
        <RotateCcw className="h-3.5 w-3.5" /> {pending ? "Restoring…" : "Restore"}
      </Button>
      {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-loss"}>{msg.message}</span>}
    </span>
  );
}
