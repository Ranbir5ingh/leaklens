import type { RateCard } from "@/lib/domain/ratecards";

export function engineLabel(e: string | null) {
  return e === "gemini+heuristic" ? "AI + rules" : e === "heuristic" ? "rules" : e === "manual" ? "edited by hand" : e === "rollback" ? "rollback" : e === "seed" ? "initial setup" : e === "saved" ? "saved" : e ?? "—";
}

export function rateCardSummary(c: RateCard): string {
  if (c.kind === "channel") return `${c.commissionPct}% commission · fixed fee ${c.fixedFeeBands.map((b) => `₹${b.feeRupees}`).join("/")} · pays in ${c.paymentCycleDays} days`;
  if (c.kind === "gateway") return `${c.feePct}% gateway fee · settles in ${c.paymentCycleDays} days`;
  return `${c.zones.length} zones · from ₹${Math.min(...c.zones.map((z) => z.slabs[0]?.rupees ?? 0))}/0.5 kg · COD ${c.codFeePct}% (min ₹${c.codFeeMinRupees}) · RTO ${c.rtoPctOfForward}% of forward`;
}

