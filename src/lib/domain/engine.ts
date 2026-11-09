import { addDays, dayNumber } from "./dates";
import { rupees, type Paise } from "./money";
import {
  channelDelivered,
  channelReturned,
  codFee,
  forwardFreight,
  gatewayPrepaid,
  rtoFreight,
  slabLabel,
  type ChannelCard,
  type CourierCard,
  type GatewayCard,
  type RateCardBook,
} from "./ratecards";
import type {
  CodRow,
  ExpectedLine,
  FreightRow,
  Issue,
  OrderRow,
  PartnerKind,
  ReceivedLine,
  ReconResult,
  ReconStatus,
  ReturnScanRow,
  SettlementRow,
} from "./types";

/**
 * The reconciliation engine. Pure and synchronous: given every row we hold and the rate cards,
 * it returns one result per order. No AI is involved — matching and expected amounts are rules
 * (brief: "Matching and expected amounts are rules, not AI").
 *
 * Complexity is O(N) in total rows: every partner row is bucketed once into hash maps keyed by
 * order ID (falling back to AWB), then each order is visited once. That is what lets 1 lakh
 * orders reconcile in well under a second (see scripts/benchmark.ts).
 */

export interface EngineInput {
  orders: OrderRow[];
  settlements: SettlementRow[];
  cod: CodRow[];
  freight: FreightRow[];
  returnScans: ReturnScanRow[];
  rateCards: RateCardBook;
  partnerKinds: Record<string, PartnerKind>;
  gatewayPartner: string; // partner code that settles prepaid website orders
  asOf: string; // ISO date the reconciliation is run "as of"
  toleranceRupees?: number; // brief: flag gaps over ₹10
}

export type OrphanKind = "settlement" | "cod" | "freight" | "returns";
export interface Orphan {
  kind: OrphanKind;
  rowId: number | undefined;
  partner: string | null;
  orderIdHint: string | null;
  awb: string | null;
  amount: Paise | null;
  date: string;
}

export interface EngineOutput {
  results: ReconResult[];
  orphans: Orphan[];
  skipped: { orderId: string; reason: string }[];
  stats: {
    orders: number;
    reconciled: number;
    matchedPartnerRows: number;
    totalPartnerRows: number;
    byStatus: Record<ReconStatus, number>;
    atRisk: Paise;
  };
}

const PRIORITY: ReconStatus[] = ["return_not_received", "freight_overcharged", "unpaid_past_due", "short_paid", "awaiting_payment", "settled"];

function push<T>(m: Map<string, T[]>, k: string, v: T) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function reconcile(input: EngineInput): EngineOutput {
  const tol = rupees(input.toleranceRupees ?? 10);
  const asOfDay = dayNumber(input.asOf);

  const orderById = new Map<string, OrderRow>();
  const orderIdByAwb = new Map<string, string>();
  for (const o of input.orders) {
    orderById.set(o.orderId, o);
    if (o.awb) orderIdByAwb.set(o.awb, o.orderId);
  }

  const orphans: Orphan[] = [];
  const resolve = (orderId: string | null, awb: string | null): string | null => {
    if (orderId && orderById.has(orderId)) return orderId;
    if (awb) {
      const viaAwb = orderIdByAwb.get(awb);
      if (viaAwb) return viaAwb;
    }
    return null;
  };

  let matchedRows = 0;
  const sByOrder = new Map<string, SettlementRow[]>();
  for (const s of input.settlements) {
    const id = resolve(s.orderId, null);
    if (id) {
      push(sByOrder, id, s);
      matchedRows++;
    } else orphans.push({ kind: "settlement", rowId: s.id, partner: s.partner, orderIdHint: s.orderId, awb: null, amount: s.net + s.tcs + s.tds, date: s.settlementDate });
  }
  const cByOrder = new Map<string, CodRow[]>();
  for (const c of input.cod) {
    const id = resolve(c.orderId, c.awb);
    if (id) {
      push(cByOrder, id, c);
      matchedRows++;
    } else orphans.push({ kind: "cod", rowId: c.id, partner: c.partner, orderIdHint: c.orderId, awb: c.awb, amount: c.remitted, date: c.remittanceDate });
  }
  const fByOrder = new Map<string, FreightRow[]>();
  for (const f of input.freight) {
    const id = resolve(f.orderId, f.awb);
    if (id) {
      push(fByOrder, id, f);
      matchedRows++;
    } else orphans.push({ kind: "freight", rowId: f.id, partner: f.partner, orderIdHint: f.orderId, awb: f.awb, amount: -f.total, date: f.invoiceDate });
  }
  const scanByOrder = new Map<string, ReturnScanRow[]>();
  for (const r of input.returnScans) {
    const id = resolve(r.orderId, r.awb);
    if (id) {
      push(scanByOrder, id, r);
      matchedRows++;
    } else orphans.push({ kind: "returns", rowId: r.id, partner: null, orderIdHint: r.orderId, awb: r.awb, amount: null, date: r.scannedAt.slice(0, 10) });
  }

  const results: ReconResult[] = [];
  const skipped: EngineOutput["skipped"] = [];
  const byStatus = Object.fromEntries(PRIORITY.map((s) => [s, 0])) as Record<ReconStatus, number>;
  let atRiskTotal = 0;

  for (const o of input.orders) {
    if (o.deliveryStatus === "in_transit" || o.deliveryStatus === "cancelled") {
      skipped.push({ orderId: o.orderId, reason: o.deliveryStatus === "cancelled" ? "Cancelled" : "Still in transit" });
      continue;
    }
    try {
      const r = reconcileOrder(o, {
        settlements: sByOrder.get(o.orderId) ?? [],
        cod: cByOrder.get(o.orderId) ?? [],
        freight: fByOrder.get(o.orderId) ?? [],
        scans: scanByOrder.get(o.orderId) ?? [],
        input,
        tol,
        asOfDay,
      });
      results.push(r);
      byStatus[r.status]++;
      atRiskTotal += r.atRisk;
    } catch (e) {
      skipped.push({ orderId: o.orderId, reason: e instanceof Error ? e.message : "Could not reconcile" });
    }
  }

  return {
    results,
    orphans,
    skipped,
    stats: {
      orders: input.orders.length,
      reconciled: results.length,
      matchedPartnerRows: matchedRows,
      totalPartnerRows: input.settlements.length + input.cod.length + input.freight.length + input.returnScans.length,
      byStatus,
      atRisk: atRiskTotal,
    },
  };
}

interface Ctx {
  settlements: SettlementRow[];
  cod: CodRow[];
  freight: FreightRow[];
  scans: ReturnScanRow[];
  input: EngineInput;
  tol: Paise;
  asOfDay: number;
}

function card<T>(book: RateCardBook, code: string, kind: string): T {
  const c = book[code];
  if (!c) throw new Error(`No rate card for ${code}`);
  if (c.kind !== kind) throw new Error(`Rate card for ${code} is not a ${kind} card`);
  return c as T;
}

export function reconcileOrder(o: OrderRow, ctx: Ctx): ReconResult {
  const { input, tol, asOfDay } = ctx;
  const kind = input.partnerKinds[o.channel];
  const expectedLines: ExpectedLine[] = [];
  const receivedLines: ReceivedLine[] = [];
  const issues: Issue[] = [];
  const returned = o.deliveryStatus === "rto" || o.deliveryStatus === "customer_return";

  let partner = o.channel;
  let dueDate: string | null = null;
  let expectedFreight: Paise | null = null;
  let billedFreight: Paise | null = null;
  let freightOver = 0;
  let inflowRows = 0;
  let tcs = 0;
  let tds = 0;
  let returnDays = 7;

  // Settlement rows (marketplace, quick-commerce, payment gateway): net + TCS + TDS.
  // TCS/TDS are tax credits we can claim back, so they count as received and are shown separately.
  for (const s of ctx.settlements) {
    inflowRows++;
    tcs += s.tcs;
    tds += s.tds;
    receivedLines.push({ label: `Payout from ${s.partner}`, amount: s.net, source: "settlement", ref: s.settlementRef, date: s.settlementDate });
    if (s.tcs) receivedLines.push({ label: "TCS (GST) withheld — claimable", amount: s.tcs, source: "settlement", ref: s.settlementRef, date: s.settlementDate });
    if (s.tds) receivedLines.push({ label: "TDS (194-O) withheld — claimable", amount: s.tds, source: "settlement", ref: s.settlementRef, date: s.settlementDate });
  }

  if (kind === "website") {
    if (!o.courier || !o.zone || o.weightKg === null) throw new Error("Website order is missing courier, zone or weight");
    const cc = card<CourierCard>(input.rateCards, o.courier, "courier");
    returnDays = cc.returnReceiptDays;
    const fwd = forwardFreight(cc, o.zone, o.weightKg);
    const isCod = o.paymentMode === "COD";
    partner = o.courier;

    if (!returned) {
      if (isCod) {
        const fee = codFee(cc, o.value);
        expectedLines.push(
          { label: "COD collected", amount: o.value, rule: "Order value collected in cash" },
          { label: "Forward freight", amount: -fwd, rule: `Zone ${o.zone}, ${slabLabel(cc, o.zone, o.weightKg)} (declared ${o.weightKg} kg)` },
          { label: "COD fee", amount: -fee, rule: `Higher of ${cc.codFeePct}% or ₹${cc.codFeeMinRupees}` },
        );
        expectedFreight = fwd + fee;
        dueDate = o.statusDate ? addDays(o.statusDate, cc.remittanceCycleDays) : null;
        for (const c of ctx.cod) {
          inflowRows++;
          receivedLines.push({ label: `COD remittance (${c.partner})`, amount: c.remitted, source: "cod", ref: c.utr, date: c.remittanceDate });
        }
      } else {
        const pg = card<GatewayCard>(input.rateCards, input.gatewayPartner, "gateway");
        partner = input.gatewayPartner;
        expectedLines.push(...gatewayPrepaid(pg, o.value), {
          label: "Forward freight",
          amount: -fwd,
          rule: `Zone ${o.zone}, ${slabLabel(cc, o.zone, o.weightKg)} (declared ${o.weightKg} kg)`,
        });
        expectedFreight = fwd;
        dueDate = o.statusDate ? addDays(o.statusDate, pg.paymentCycleDays) : null;
      }
    } else {
      const rto = rtoFreight(cc, fwd);
      expectedLines.push(
        { label: "Forward freight", amount: -fwd, rule: `Zone ${o.zone}, ${slabLabel(cc, o.zone, o.weightKg)} (declared ${o.weightKg} kg)` },
        { label: "RTO freight", amount: -rto, rule: `${cc.rtoPctOfForward}% of forward` },
      );
      expectedFreight = fwd + rto;
    }

    // Freight invoices. For delivered COD orders the aggregator nets freight out of the remittance
    // (assumption A3), so invoice lines are only used for the overcharge check, not as cash out.
    const netted = isCod && !returned;
    if (ctx.freight.length) {
      billedFreight = 0;
      let lastInvoiceDate: string | null = null;
      let maxBilledW = 0;
      for (const f of ctx.freight) {
        billedFreight += f.total;
        lastInvoiceDate = f.invoiceDate;
        if (f.billedWeightKg && f.billedWeightKg > maxBilledW) maxBilledW = f.billedWeightKg;
        if (!netted) receivedLines.push({ label: `Freight billed (${f.partner})`, amount: -f.total, source: "freight", ref: f.invoiceNo, date: f.invoiceDate });
      }
      freightOver = billedFreight - (expectedFreight ?? 0);
      if (freightOver > tol) {
        const wNote = maxBilledW && o.weightKg !== null && maxBilledW > o.weightKg
          ? ` Billed weight ${maxBilledW} kg (${slabLabel(cc, o.zone, maxBilledW)}) vs declared ${o.weightKg} kg (${slabLabel(cc, o.zone, o.weightKg)}).`
          : "";
        issues.push({ type: "freight_overcharged", amount: freightOver, partner: o.courier, message: `Freight billed ₹${(billedFreight / 100).toFixed(2)} vs rate card ₹${((expectedFreight ?? 0) / 100).toFixed(2)}.${wNote}`, since: lastInvoiceDate });
      } else freightOver = 0;
    } else if (!netted) {
      // Invoice not in yet: assume rate-card freight so the order does not look over-paid.
      receivedLines.push({ label: "Freight not yet invoiced (rate card assumed)", amount: -(expectedFreight ?? 0), source: "freight", ref: null, date: null });
    }
  } else if (kind === "marketplace" || kind === "quick_commerce") {
    const cc = card<ChannelCard>(input.rateCards, o.channel, "channel");
    returnDays = cc.returnReceiptDays;
    if (!returned) {
      expectedLines.push(...channelDelivered(cc, o.value));
      dueDate = o.statusDate ? addDays(o.statusDate, cc.paymentCycleDays) : null;
    } else {
      expectedLines.push(...channelReturned(cc));
    }
  } else {
    throw new Error(`Unknown channel ${o.channel}`);
  }

  const expected = expectedLines.reduce((a, l) => a + l.amount, 0);
  const received = receivedLines.reduce((a, l) => a + l.amount, 0);
  const difference = received - expected;

  // Return check: anything returned must be scanned at the warehouse within the window.
  if (returned) {
    const windowEnd = o.statusDate ? addDays(o.statusDate, returnDays) : null;
    if (ctx.scans.length === 0 && windowEnd && dayNumber(windowEnd) < asOfDay) {
      issues.push({ type: "return_not_received", amount: o.value, partner: kind === "website" && o.courier ? o.courier : o.channel, message: `Marked returned on ${o.statusDate}; no warehouse receipt scan after ${returnDays} days.`, since: windowEnd });
    }
  }

  // Payment check, net of any freight overcharge (counted once, above).
  const paymentGap = difference + freightOver;
  if (!returned && expected > 0) {
    if (inflowRows === 0) {
      if (dueDate && dayNumber(dueDate) < asOfDay) {
        issues.push({ type: "unpaid_past_due", amount: expected, partner, message: `Nothing received; payment was due on ${dueDate}.`, since: dueDate });
      }
    } else if (paymentGap < -tol) {
      issues.push({ type: "short_paid", amount: -paymentGap, partner, message: `Received ₹${((received + freightOver) / 100).toFixed(2)} against expected ₹${(expected / 100).toFixed(2)}.`, since: dueDate ?? lastDate(receivedLines) });
    } else if (paymentGap > tol) {
      issues.push({ type: "overpaid", amount: paymentGap, partner, message: `Received ₹${(paymentGap / 100).toFixed(2)} more than expected — check for a later adjustment.`, since: lastDate(receivedLines) });
    }
  } else if (returned && inflowRows > 0 && paymentGap < -tol) {
    issues.push({ type: "short_paid", amount: -paymentGap, partner, message: `Return deductions exceed the rate card by ₹${(-paymentGap / 100).toFixed(2)}.`, since: lastDate(receivedLines) });
  }

  let status: ReconStatus = "settled";
  const risky = issues.filter((i) => i.type !== "overpaid");
  if (risky.length) {
    status = PRIORITY.find((p) => risky.some((i) => i.type === p)) as ReconStatus;
  } else if (!returned && expected > 0 && inflowRows === 0) {
    status = "awaiting_payment";
  }
  const primary = risky.find((i) => i.type === status);

  return {
    orderId: o.orderId,
    channel: o.channel,
    partner,
    status,
    expected,
    received,
    difference,
    tcs,
    tds,
    expectedFreight,
    billedFreight,
    dueDate,
    atRisk: risky.reduce((a, i) => a + i.amount, 0),
    riskSince: primary?.since ?? null,
    issues,
    expectedLines,
    receivedLines,
  };
}

function lastDate(lines: ReceivedLine[]): string | null {
  let d: string | null = null;
  for (const l of lines) if (l.date && (!d || l.date > d)) d = l.date;
  return d;
}

/** Age buckets for the money-at-risk view. */
export const AGE_BUCKETS = [
  { key: "0-15", label: "0–15 days", max: 15 },
  { key: "16-30", label: "16–30 days", max: 30 },
  { key: "31-60", label: "31–60 days", max: 60 },
  { key: "60+", label: "60+ days", max: Infinity },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]["key"];

export function ageBucket(sinceIso: string | null, asOfIso: string): AgeBucket {
  if (!sinceIso) return "0-15";
  const age = Math.max(0, dayNumber(asOfIso) - dayNumber(sinceIso));
  return AGE_BUCKETS.find((b) => age <= b.max)!.key;
}
