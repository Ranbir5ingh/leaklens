import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Order, payment and return reconciliation for Company A.</p>
          <div className="mt-8">
            <LoginForm next={next} showDemo={process.env.DEMO_MODE !== "off"} />
          </div>
        </div>
      </section>
      <aside className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Every partner, every order</p>
          <p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight">Know, per order, whether you were paid the right amount.</p>
          <dl className="mt-10 space-y-5 text-sm">
            {[
              ["Upload any partner report", "Saved column mappings per source. When a format changes, AI suggests the new mapping — you preview 20 rows and approve."],
              ["Rules, not guesses", "Expected amounts come from your rate cards. Gaps over ₹10 are flagged; TCS and TDS are shown as tax credits, not leakage."],
              ["Claims with evidence", "Short, late or overcharged orders land in a claims list per partner, exportable as CSV or PDF."],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-line-strong pl-4">
                <dt className="font-medium text-ink">{t}</dt>
                <dd className="mt-0.5 text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
