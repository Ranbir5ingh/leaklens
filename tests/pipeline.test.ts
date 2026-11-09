import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { generate } from "@/lib/data/generate";
import { formatToMapping } from "@/lib/data/formats";
import { parseFile } from "@/lib/data/pipeline";
import { reconcile } from "@/lib/domain/engine";
import { DEFAULT_RATE_CARDS, GATEWAY_PARTNER, partnerKinds } from "@/lib/domain/partners";
import { rupees } from "@/lib/domain/money";
import type { RawRow } from "@/lib/domain/mapping";
import { runBenchmark } from "../scripts/benchmark";

function runAll(n: number) {
  const data = generate({ orders: n, asOf: "2026-11-09" });
  const acc = { orders: [] as never[], settlement: [] as never[], cod: [] as never[], freight: [] as never[], returns: [] as never[] };
  let rejected = 0;
  for (const f of Object.values(data.files)) {
    const rows = Papa.parse<RawRow>(Papa.unparse(f.rows), { header: true, skipEmptyLines: true }).data;
    const res = parseFile(f.format.kind, f.format.partner, formatToMapping(f.format), rows);
    rejected += res.rejected.length;
    (acc[f.format.kind] as unknown[]).push(...res.rows);
  }
  const out = reconcile({ orders: acc.orders, settlements: acc.settlement, cod: acc.cod, freight: acc.freight, returnScans: acc.returns, rateCards: DEFAULT_RATE_CARDS, partnerKinds: partnerKinds(), gatewayPartner: GATEWAY_PARTNER, asOf: data.asOf });
  return { data, out, rejected };
}

describe("seeded data through the real pipeline (CSV → mapping → engine)", () => {
  const { out, rejected, data } = runAll(3000);

  it("every generated row passes validation", () => expect(rejected).toBe(0));

  it("reproduces the brief's three sample rows exactly", () => {
    const g = (id: string) => out.results.find((r) => r.orderId === id)!;
    expect([g("ORD-W-204118").expected, g("ORD-W-204118").received, g("ORD-W-204118").difference]).toEqual([rupees(1409), 0, rupees(-1409)]);
    expect([g("ORD-M-88120").expected, g("ORD-M-88120").received, g("ORD-M-88120").difference]).toEqual([rupees(899), rupees(862), rupees(-37)]);
    expect([g("ORD-W-204377").expected, g("ORD-W-204377").received, g("ORD-W-204377").difference]).toEqual([rupees(-96), rupees(-142), rupees(-46)]);
    expect(g("ORD-W-204118").status).toBe("unpaid_past_due");
    expect(g("ORD-M-88120").status).toBe("short_paid");
    expect(g("ORD-W-204377").status).toBe("freight_overcharged");
  });

  it("auto-matches at least 98% of partner rows (brief's success metric)", () => {
    expect(out.stats.matchedPartnerRows / out.stats.totalPartnerRows).toBeGreaterThan(0.98);
  });

  it("finds every injected leak category", () => {
    const s = out.stats.byStatus;
    expect(s.short_paid).toBeGreaterThan(0);
    expect(s.unpaid_past_due).toBeGreaterThan(0);
    expect(s.freight_overcharged).toBeGreaterThan(0);
    expect(s.return_not_received).toBeGreaterThan(0);
    expect(data.truth.injected.weight_slab_error).toBeGreaterThan(0);
  });

  it("never treats TCS/TDS as leakage", () => {
    const withTax = out.results.filter((r) => r.tcs > 0 && r.status === "settled");
    expect(withTax.length).toBeGreaterThan(100);
    for (const r of withTax) expect(Math.abs(r.difference)).toBeLessThanOrEqual(1000);
  });
});

describe("performance — the brief's hard part", () => {
  it("1 lakh orders: CSV parse + mapping + matching + suggestions in under 60 s", async () => {
    const { summary } = await runBenchmark(100_000, () => {});
    expect(summary.orders).toBeGreaterThanOrEqual(100_000);
    expect(summary.rejected).toBe(0);
    expect(summary.msPipelineTotal).toBeLessThan(60_000);
    // Leave a wide margin so slow CI machines still pass, but catch an accidental O(n²).
    expect(summary.msMatch).toBeLessThan(10_000);
  });
});
