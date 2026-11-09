import { describe, expect, it } from "vitest";
import { reconcile, ageBucket, type EngineInput } from "@/lib/domain/engine";
import { DEFAULT_RATE_CARDS, GATEWAY_PARTNER, partnerKinds } from "@/lib/domain/partners";
import { rupees } from "@/lib/domain/money";
import type { OrderRow } from "@/lib/domain/types";

const base = (over: Partial<EngineInput>): EngineInput => ({
  orders: [],
  settlements: [],
  cod: [],
  freight: [],
  returnScans: [],
  rateCards: DEFAULT_RATE_CARDS,
  partnerKinds: partnerKinds(),
  gatewayPartner: GATEWAY_PARTNER,
  asOf: "2026-11-09",
  ...over,
});

// The three rows from the client's brief, reproduced exactly.
const W204118: OrderRow = { orderId: "ORD-W-204118", channel: "WEB", orderDate: "2026-09-24", value: rupees(1499), paymentMode: "COD", deliveryStatus: "delivered", statusDate: "2026-09-29", courier: "CA1", awb: "CA1-7781204118", weightKg: 0.5, zone: "C" };
const M88120: OrderRow = { orderId: "ORD-M-88120", channel: "MP1", orderDate: "2026-09-26", value: rupees(1199), paymentMode: "Prepaid", deliveryStatus: "delivered", statusDate: "2026-09-30", courier: null, awb: null, weightKg: null, zone: null };
const W204377: OrderRow = { orderId: "ORD-W-204377", channel: "WEB", orderDate: "2026-10-01", value: rupees(2398), paymentMode: "Prepaid", deliveryStatus: "rto", statusDate: "2026-10-12", courier: "CA2", awb: "CA2-5520204377", weightKg: 0.5, zone: "A" };

describe("brief sample rows", () => {
  const out = reconcile(
    base({
      orders: [W204118, M88120, W204377],
      settlements: [
        { partner: "MP1", orderId: "ORD-M-88120", settlementRef: "MP1-STL-1009", settlementDate: "2026-10-10", gross: rupees(1199), commission: rupees(240), fixedFee: rupees(60), shippingFee: 0, otherFees: rupees(37), tcs: 571, tds: 120, net: rupees(862) - 571 - 120 },
        { partner: "PG", orderId: "ORD-W-204377", settlementRef: "PG-REF", settlementDate: "2026-10-04", gross: rupees(2398), commission: null, fixedFee: null, shippingFee: null, otherFees: null, tcs: 0, tds: 0, net: 0 },
      ],
      freight: [{ partner: "CA2", awb: "CA2-5520204377", orderId: null, invoiceNo: "CA2-INV-2610", invoiceDate: "2026-10-31", billedWeightKg: 1, zone: "A", forward: rupees(71), rto: rupees(71), codFee: 0, total: rupees(142) }],
      returnScans: [{ orderId: "ORD-W-204377", awb: null, scannedAt: "2026-10-14", condition: "Good" }],
    }),
  );
  const get = (id: string) => out.results.find((r) => r.orderId === id)!;

  it("ORD-W-204118: COD, expected 1409, received 0, difference −1409, unpaid past due", () => {
    const r = get("ORD-W-204118");
    expect(r.expected).toBe(rupees(1409));
    expect(r.received).toBe(0);
    expect(r.difference).toBe(rupees(-1409));
    expect(r.status).toBe("unpaid_past_due");
    expect(r.atRisk).toBe(rupees(1409));
  });

  it("ORD-M-88120: expected 899, received 862 (TCS/TDS counted as received), short-paid 37", () => {
    const r = get("ORD-M-88120");
    expect(r.expected).toBe(rupees(899));
    expect(r.received).toBe(rupees(862));
    expect(r.difference).toBe(rupees(-37));
    expect(r.status).toBe("short_paid");
    expect(r.tcs).toBe(571);
    expect(r.tds).toBe(120);
    expect(r.atRisk).toBe(rupees(37));
  });

  it("ORD-W-204377: RTO, expected −96, received −142, difference −46, freight overcharged", () => {
    const r = get("ORD-W-204377");
    expect(r.expected).toBe(rupees(-96));
    expect(r.received).toBe(rupees(-142));
    expect(r.difference).toBe(rupees(-46));
    expect(r.status).toBe("freight_overcharged");
    expect(r.atRisk).toBe(rupees(46));
    expect(r.issues[0].message).toContain("1 kg slab");
  });
});

describe("statuses and edge cases", () => {
  it("within ₹10 tolerance is settled", () => {
    const out = reconcile(base({ orders: [M88120], settlements: [{ partner: "MP1", orderId: "ORD-M-88120", settlementRef: "x", settlementDate: "2026-10-10", gross: null, commission: null, fixedFee: null, shippingFee: null, otherFees: null, tcs: 0, tds: 0, net: rupees(889.5) }] }));
    expect(out.results[0].status).toBe("settled");
  });

  it("a gap of exactly ₹10.01 is flagged, ₹10.00 is not", () => {
    const mk = (net: number) => reconcile(base({ orders: [M88120], settlements: [{ partner: "MP1", orderId: "ORD-M-88120", settlementRef: "x", settlementDate: "2026-10-10", gross: null, commission: null, fixedFee: null, shippingFee: null, otherFees: null, tcs: 0, tds: 0, net }] })).results[0].status;
    expect(mk(rupees(889))).toBe("settled");
    expect(mk(rupees(888.99))).toBe("short_paid");
  });

  it("not yet due is awaiting payment, not a leak", () => {
    const fresh = { ...M88120, statusDate: "2026-11-05" };
    const r = reconcile(base({ orders: [fresh] })).results[0];
    expect(r.status).toBe("awaiting_payment");
    expect(r.atRisk).toBe(0);
  });

  it("return without a warehouse scan after the window is caught", () => {
    const r = reconcile(base({ orders: [{ ...W204377 }] })).results[0];
    expect(r.status).toBe("return_not_received");
    expect(r.atRisk).toBe(rupees(2398));
  });

  it("return inside the window is not flagged yet", () => {
    const r = reconcile(base({ orders: [{ ...W204377, statusDate: "2026-11-06" }] })).results[0];
    expect(r.status).toBe("settled");
  });

  it("COD remittance matched by AWB when the order ID is missing", () => {
    const out = reconcile(base({ orders: [W204118], cod: [{ partner: "CA1", awb: "CA1-7781204118", orderId: null, collected: rupees(1499), remitted: rupees(1409), remittanceDate: "2026-10-06", utr: "UTR1" }] }));
    expect(out.results[0].status).toBe("settled");
    expect(out.orphans).toHaveLength(0);
  });

  it("COD remittance with freight overcharge is not double counted as short-paid", () => {
    const out = reconcile(base({
      orders: [W204118],
      cod: [{ partner: "CA1", awb: "CA1-7781204118", orderId: null, collected: rupees(1499), remitted: rupees(1379), remittanceDate: "2026-10-06", utr: "UTR1" }],
      freight: [{ partner: "CA1", awb: "CA1-7781204118", orderId: null, invoiceNo: "I1", invoiceDate: "2026-10-31", billedWeightKg: 1, zone: "C", forward: rupees(80), rto: 0, codFee: rupees(40), total: rupees(120) }],
    }));
    const r = out.results[0];
    expect(r.status).toBe("freight_overcharged");
    expect(r.issues.map((i) => i.type)).toEqual(["freight_overcharged"]);
    expect(r.atRisk).toBe(rupees(30));
  });

  it("unknown order IDs become orphans for the review queue", () => {
    const out = reconcile(base({ orders: [M88120], settlements: [{ partner: "MP1", orderId: "ORD-M-8812O", settlementRef: "x", settlementDate: "2026-10-10", gross: null, commission: null, fixedFee: null, shippingFee: null, otherFees: null, tcs: 0, tds: 0, net: rupees(899) }] }));
    expect(out.orphans).toHaveLength(1);
    expect(out.results[0].status).toBe("unpaid_past_due");
  });

  it("over-payment is noted but not counted as money at risk", () => {
    const out = reconcile(base({ orders: [M88120], settlements: [{ partner: "MP1", orderId: "ORD-M-88120", settlementRef: "x", settlementDate: "2026-10-10", gross: null, commission: null, fixedFee: null, shippingFee: null, otherFees: null, tcs: 0, tds: 0, net: rupees(950) }] }));
    expect(out.results[0].status).toBe("settled");
    expect(out.results[0].issues[0].type).toBe("overpaid");
    expect(out.results[0].atRisk).toBe(0);
  });

  it("missing rate card is reported, not crashed", () => {
    const out = reconcile(base({ orders: [{ ...M88120, channel: "MP1" }], rateCards: {} }));
    expect(out.results).toHaveLength(0);
    expect(out.skipped[0].reason).toMatch(/No rate card/);
  });

  it("cancelled and in-transit orders are skipped", () => {
    const out = reconcile(base({ orders: [{ ...M88120, deliveryStatus: "cancelled" }, { ...M88120, orderId: "X", deliveryStatus: "in_transit" }] }));
    expect(out.results).toHaveLength(0);
    expect(out.skipped).toHaveLength(2);
  });

  it("ages money at risk into buckets", () => {
    expect(ageBucket("2026-11-01", "2026-11-09")).toBe("0-15");
    expect(ageBucket("2026-10-20", "2026-11-09")).toBe("16-30");
    expect(ageBucket("2026-09-20", "2026-11-09")).toBe("31-60");
    expect(ageBucket("2026-08-01", "2026-11-09")).toBe("60+");
  });
});
