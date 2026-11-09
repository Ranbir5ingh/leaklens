"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const DEMO = [
  { label: "Finance executive", email: "exec@leaklens.demo", password: "Exec@Demo2026", note: "Uploads, mappings, review queue, claims" },
  { label: "Finance co-founder", email: "cofounder@leaklens.demo", password: "Founder@Demo2026", note: "Everything, plus rate cards, rollbacks and audit log" },
];

export function LoginForm({ next, showDemo }: { next?: string; showDemo: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Work email">
          <input className={inputClass} name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.in" />
        </Field>
        <Field label="Password">
          <input className={inputClass} name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {state.error && <Alert tone="loss">{state.error}</Alert>}
        <Button variant="primary" className="w-full" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {showDemo && (
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Demo accounts</div>
        <div className="grid gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
              }}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-sunken"
            >
              <div className="text-sm font-medium text-ink">{d.label}</div>
              <div className="text-xs text-muted">
                {d.email} · {d.note}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">Click an account to fill the form. All data is synthetic.</p>
      </div>
      )}
    </div>
  );
}
