"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui";

export function RunReconButton({ action, label = "Run matching again" }: { action: () => Promise<{ ok: boolean; message: string }>; label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      {msg && <span role="status" className={msg.ok ? "text-xs text-muted" : "text-xs text-loss"}>{msg.message}</span>}
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await action();
              setMsg(r);
              router.refresh();
            } catch {
              setMsg({ ok: false, message: "Could not run matching. Try again." });
            }
          })
        }
      >
        <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
        {pending ? "Matching…" : label}
      </Button>
    </div>
  );
}
