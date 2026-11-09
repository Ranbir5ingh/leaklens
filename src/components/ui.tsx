import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { formatINR, formatINRCompact } from "@/lib/domain/money";
import { STATUS_LABEL, type ReconStatus } from "@/lib/domain/types";

export const cx = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border-transparent shadow-sm",
  secondary: "bg-surface text-ink border-line-strong hover:bg-sunken",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-sunken",
  danger: "bg-surface text-loss border-loss-line hover:bg-loss-soft",
};
export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
    btn[variant],
  );
}
export function Button({ variant = "secondary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button {...p} className={cx(buttonClass(variant, size), className)} />;
}
export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function Card({ className, children, ...p }: ComponentProps<"div">) {
  return (
    <div {...p} className={cx("rounded-xl border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type Tone = "loss" | "warn" | "ok" | "info" | "neutral" | "accent";
const tones: Record<Tone, string> = {
  loss: "bg-loss-soft text-loss border-loss-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  ok: "bg-ok-soft text-ok border-ok-line",
  info: "bg-info-soft text-info border-line",
  neutral: "bg-sunken text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-line",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<ReconStatus, Tone> = {
  settled: "ok",
  awaiting_payment: "neutral",
  short_paid: "loss",
  unpaid_past_due: "loss",
  freight_overcharged: "warn",
  return_not_received: "loss",
};
export function StatusBadge({ status }: { status: string }) {
  const s = status as ReconStatus;
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? status}</Badge>;
}

/** Money with meaning: negatives/losses in red only when `signal` is set. */
export function Money({ paise, signal, compact, className, sign }: { paise: number | null | undefined; signal?: boolean; compact?: boolean; className?: string; sign?: boolean }) {
  if (paise === null || paise === undefined) return <span className={cx("text-faint", className)}>—</span>;
  const text = compact ? formatINRCompact(paise) : formatINR(paise, { sign });
  const color = signal ? (paise < -1000 ? "text-loss font-medium" : paise > 1000 ? "text-ok" : "text-ink-2") : "";
  return <span className={cx("num", color, className)}>{text}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "loss" | "ok" | "neutral" }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("num mt-1.5 text-2xl font-semibold tracking-tight", tone === "loss" ? "text-loss" : tone === "ok" ? "text-ok" : "text-ink")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-line bg-sunken" aria-hidden />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cx("border-b border-line bg-sunken/60 px-3 py-2 text-xs font-medium text-muted whitespace-nowrap", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function Td({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <td className={cx("border-b border-line px-3 py-2.5 text-sm align-middle", right && "text-right", className)}>{children}</td>;
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
    </label>
  );
}
export const inputClass = "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "loss" ? "alert" : "status"} className={cx("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone])}>
      {title && <div className="font-medium">{title}</div>}
      {children && <div className={cx(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const iso = d instanceof Date ? d.toISOString() : d;
  const dt = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
}
