import type { RateCard } from "./ratecards";
import type { FileKind, PartnerKind } from "./types";

/**
 * The client's partner landscape from the brief: own website, 3 marketplaces, 2 quick-commerce apps,
 * 2 courier aggregators. The brief names no companies, so partners use neutral names (assumption A1);
 * "Marketplace 1" matches the brief's sample data. A payment gateway settles prepaid website orders
 * (assumption A4) and the warehouse produces return receipt scans.
 */
export interface PartnerDef {
  code: string;
  name: string;
  kind: PartnerKind;
  files: FileKind[];
}

export const PARTNERS: PartnerDef[] = [
  { code: "WEB", name: "Website", kind: "website", files: ["orders"] },
  { code: "MP1", name: "Marketplace 1", kind: "marketplace", files: ["orders", "settlement"] },
  { code: "MP2", name: "Marketplace 2", kind: "marketplace", files: ["orders", "settlement"] },
  { code: "MP3", name: "Marketplace 3", kind: "marketplace", files: ["orders", "settlement"] },
  { code: "QC1", name: "Quick-commerce 1", kind: "quick_commerce", files: ["orders", "settlement"] },
  { code: "QC2", name: "Quick-commerce 2", kind: "quick_commerce", files: ["orders", "settlement"] },
  { code: "CA1", name: "Courier aggregator 1", kind: "courier", files: ["cod", "freight"] },
  { code: "CA2", name: "Courier aggregator 2", kind: "courier", files: ["cod", "freight"] },
  { code: "PG", name: "Payment gateway", kind: "payment_gateway", files: ["settlement"] },
  { code: "WH", name: "Warehouse", kind: "warehouse", files: ["returns"] },
];

export const GATEWAY_PARTNER = "PG";
export const partnerName = (code: string) => PARTNERS.find((p) => p.code === code)?.name ?? code;
export const partnerKinds = (): Record<string, PartnerKind> => Object.fromEntries(PARTNERS.map((p) => [p.code, p.kind]));

const zones = (rows: [string, number, number, number, number, number][]) =>
  rows.map(([zone, a, b, c, d, extra]) => ({
    zone,
    slabs: [
      { upToKg: 0.5, rupees: a },
      { upToKg: 1, rupees: b },
      { upToKg: 2, rupees: c },
      { upToKg: 5, rupees: d },
    ],
    perExtraKgRupees: extra,
  }));

/** Illustrative contract terms (assumption A5 — the brief gives none beyond the sample rows). */
export const DEFAULT_RATE_CARDS: Record<string, RateCard> = {
  MP1: {
    kind: "channel",
    commissionPct: 20,
    fixedFeeBands: [
      { upToRupees: 500, feeRupees: 15 },
      { upToRupees: 1000, feeRupees: 30 },
      { upToRupees: null, feeRupees: 60 },
    ],
    shippingFeeRupees: 0,
    returnFeeRupees: 75,
    paymentCycleDays: 10,
    returnReceiptDays: 14,
    roundFeesToRupee: true,
  },
  MP2: {
    kind: "channel",
    commissionPct: 18,
    fixedFeeBands: [
      { upToRupees: 500, feeRupees: 10 },
      { upToRupees: 1000, feeRupees: 25 },
      { upToRupees: null, feeRupees: 45 },
    ],
    shippingFeeRupees: 40,
    returnFeeRupees: 60,
    paymentCycleDays: 7,
    returnReceiptDays: 14,
    roundFeesToRupee: true,
  },
  MP3: {
    kind: "channel",
    commissionPct: 22,
    fixedFeeBands: [
      { upToRupees: 750, feeRupees: 20 },
      { upToRupees: null, feeRupees: 40 },
    ],
    shippingFeeRupees: 0,
    returnFeeRupees: 90,
    paymentCycleDays: 15,
    returnReceiptDays: 14,
    roundFeesToRupee: true,
  },
  QC1: {
    kind: "channel",
    commissionPct: 28,
    fixedFeeBands: [{ upToRupees: null, feeRupees: 15 }],
    shippingFeeRupees: 0,
    returnFeeRupees: 30,
    paymentCycleDays: 7,
    returnReceiptDays: 10,
    roundFeesToRupee: true,
  },
  QC2: {
    kind: "channel",
    commissionPct: 25,
    fixedFeeBands: [{ upToRupees: null, feeRupees: 20 }],
    shippingFeeRupees: 0,
    returnFeeRupees: 30,
    paymentCycleDays: 14,
    returnReceiptDays: 10,
    roundFeesToRupee: true,
  },
  PG: { kind: "gateway", feePct: 2, paymentCycleDays: 3, roundFeesToRupee: true },
  CA1: {
    kind: "courier",
    zones: zones([
      ["A", 38, 62, 98, 190, 34],
      ["B", 44, 70, 112, 215, 38],
      ["C", 50, 80, 128, 245, 44],
      ["D", 58, 92, 148, 280, 50],
      ["E", 70, 112, 176, 330, 60],
    ]),
    rtoPctOfForward: 100,
    codFeePct: 2,
    codFeeMinRupees: 40,
    remittanceCycleDays: 7,
    returnReceiptDays: 7,
  },
  CA2: {
    kind: "courier",
    zones: zones([
      ["A", 48, 71, 108, 205, 36],
      ["B", 52, 78, 118, 225, 40],
      ["C", 56, 86, 130, 250, 45],
      ["D", 64, 98, 150, 285, 52],
      ["E", 78, 120, 182, 340, 62],
    ]),
    rtoPctOfForward: 100,
    codFeePct: 1.75,
    codFeeMinRupees: 35,
    remittanceCycleDays: 5,
    returnReceiptDays: 7,
  },
};

/** The three rows quoted in the brief. Sample files never touch them, so their arithmetic stays demonstrable. */
export const BRIEF_SAMPLE_ORDER_IDS = ["ORD-W-204118", "ORD-M-88120", "ORD-W-204377"];
