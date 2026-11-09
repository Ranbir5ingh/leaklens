"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { rollbackMapping } from "../actions";

export function RollbackButton({ versionId, version, allowed }: { versionId: number; version: number; allowed: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  if (!allowed) return <span className="text-xs text-muted" title="Rollback is a co-founder decision">Co-founder can roll back</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Make v${version} the active mapping again? Future uploads for this report will use it.`)) return;
          start(async () => setMsg(await rollbackMapping({ versionId })));
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> {pending ? "Rolling back…" : `Roll back to v${version}`}
      </Button>
      {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-loss"} role="status">{msg.message}</span>}
    </span>
  );
}
