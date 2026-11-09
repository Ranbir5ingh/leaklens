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
      <aside className="relative hidden overflow-hidden bg-rail text-rail-ink lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <p className="text-[11px] font-medium tracking-[0.12em] text-rail-muted uppercase">Every partner · every order</p>
          <p className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em]">Know, per order, whether you were paid the right amount.</p>
          <div className="mt-10 rounded-2xl border border-rail-2 bg-[#262c27] p-5 shadow-2xl">
            <div className="flex items-center justify-between text-[12px] text-rail-muted"><span className="font-mono text-rail-ink">ORD-M-88120</span><span>Marketplace 1 · prepaid</span></div>
            <dl className="mt-4 space-y-2 text-[13px]">
              {[["Order value", "₹1,199"], ["Commission 20%", "−₹240"], ["Fixed fee (₹1,000+ band)", "−₹60"]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-rail-muted">{k}</dt><dd className="num">{v}</dd></div>
              ))}
              <div className="flex justify-between border-t border-rail-2 pt-2 font-medium"><dt>Expected</dt><dd className="num">₹899</dd></div>
              <div className="flex justify-between"><dt className="text-rail-muted">Received</dt><dd className="num">₹862</dd></div>
            </dl>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-[#3a2a25] px-3 py-2 text-[13px]">
              <span className="text-[#f0b9a8]">Short-paid · claim against Marketplace 1</span>
              <span className="num font-semibold text-[#f0b9a8]">−₹37</span>
            </div>
          </div>
          <ul className="mt-8 space-y-3 text-[13px] text-rail-muted">
            <li><span className="text-rail-ink">Any partner report.</span> Saved column mappings; AI suggests new ones, you approve after a 20-row preview.</li>
            <li><span className="text-rail-ink">Rules, not guesses.</span> Expected amounts come from your rate cards; TCS/TDS is tax credit, not leakage.</li>
            <li><span className="text-rail-ink">Claims with evidence.</span> Per partner, as CSV or PDF, aged by days overdue.</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
