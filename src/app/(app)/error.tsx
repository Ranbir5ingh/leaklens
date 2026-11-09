"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
      <h1 className="text-base font-semibold">This page couldn’t load</h1>
      <p className="mt-1 text-sm text-muted">Nothing was changed. It is usually a brief database hiccup — try again. If it keeps happening, share this reference: <span className="font-mono">{error.digest ?? "n/a"}</span></p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <a href="/" className="inline-flex h-9 items-center rounded-lg px-3.5 text-sm text-ink-2 hover:bg-sunken">Go to overview</a>
      </div>
    </Card>
  );
}
