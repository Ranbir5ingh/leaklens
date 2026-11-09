import { describe, expect, it } from "vitest";
import { idSimilarity, levenshtein, suggestMatches, type Candidate } from "@/lib/domain/suggest-matches";
import type { Orphan } from "@/lib/domain/engine";

const cands: Candidate[] = [
  { orderId: "ORD-M-88120", partner: "MP1", awb: null, expected: 89900, anchorDate: "2026-10-10" },
  { orderId: "ORD-M-88121", partner: "MP1", awb: null, expected: 45000, anchorDate: "2026-10-10" },
  { orderId: "ORD-M-77120", partner: "MP1", awb: null, expected: 89900, anchorDate: "2026-08-01" },
  { orderId: "ORD-M-88120X", partner: "MP2", awb: null, expected: 89900, anchorDate: "2026-10-10" },
];
const orphan = (o: Partial<Orphan>): Orphan => ({ kind: "settlement", rowId: 1, partner: "MP1", orderIdHint: null, awb: null, amount: 89900, date: "2026-10-11", ...o });

describe("match suggestions", () => {
  it("levenshtein basics", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(idSimilarity("ORD-M-8812O", "ORD-M-88120")).toBe(1); // letter O vs zero
    expect(idSimilarity("88120", "ORD-M-88120")).toBeGreaterThan(0.8);
  });

  it("ranks a typo'd ID with matching amount and date first", () => {
    const s = suggestMatches([orphan({ orderIdHint: "ORD-M-88210" })], cands);
    expect(s[0].orderId).toBe("ORD-M-88120");
    expect(s[0].confidence).toBeLessThan(1);
    expect(s.every((x) => x.orderId !== "ORD-M-88120X")).toBe(true); // other partner excluded
  });

  it("with no ID at all, confidence stays low (never auto-closable)", () => {
    const s = suggestMatches([orphan({})], cands, { minConfidence: 0 });
    expect(Math.max(...s.map((x) => x.confidence))).toBeLessThanOrEqual(0.6);
  });

  it("returns nothing when nothing is plausible", () => {
    expect(suggestMatches([orphan({ orderIdHint: "ZZZ-999", amount: 1 })], cands)).toHaveLength(0);
  });
});
