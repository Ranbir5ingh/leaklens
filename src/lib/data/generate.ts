import { addDays, dayNumber } from "@/lib/domain/dates";
import { pctOf, roundToRupee, rupees, type Paise } from "@/lib/domain/money";
import { channelDelivered, channelReturned, codFee, forwardFreight, gatewayPrepaid, rtoFreight, type ChannelCard, type CourierCard, type GatewayCard } from "@/lib/domain/ratecards";
import { DEFAULT_RATE_CARDS } from "@/lib/domain/partners";
import type { RawRow } from "@/lib/domain/mapping";
import type { DeliveryStatus, FileKind } from "@/lib/domain/types";
import { MP1_SETTLEMENT_V2_HEADERS, SOURCE_FORMATS, sourceKey, type SourceFormat } from "./formats";

/**
 * Deterministic synthetic data for a D2C home-textiles brand. Volumes and leak rates follow the
 * brief's assumptions (30,000 orders a month at ~₹1,200, 55% of website orders COD, ~1.5% of value
 * leaking through unremitted COD, wrong fees, wrong weight slabs and lost returns).
 * All people are fictional; phones are random and not real.
 */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const pick = <T,>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
function weighted<T>(r: R, xs: readonly (readonly [T, number])[]): T {
  const total = xs.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) if ((x -= w) < 0) return v;
  return xs[xs.length - 1][0];
}
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const FIRST = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya", "Rahul", "Meera", "Karthik", "Divya", "Siddharth", "Pooja", "Nikhil", "Lakshmi", "Aditya", "Ishita", "Manoj", "Farah", "Imran", "Neha", "Suresh", "Harpreet", "Joseph", "Deepa", "Gaurav", "Tanvi", "Rajesh", "Swati"];
const LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Patel", "Rao", "Menon", "Singh", "Khan", "Das", "Joshi", "Kulkarni", "Hegde", "Shetty", "Agarwal", "Bose", "Pillai", "Mehta", "Fernandes"];
const STREETS = ["MG Road", "Indiranagar 100 Ft Rd", "HSR Layout Sector 2", "Koramangala 5th Block", "Andheri West", "Banjara Hills Rd 12", "Salt Lake Sector V", "Anna Nagar", "Viman Nagar", "Sector 62"];
const PINS = ["560038", "560102", "560034", "400053", "500034", "700091", "600040", "411014", "201309", "110017", "302017", "682016"];
const PRICES = [[399, 6], [499, 9], [649, 8], [799, 10], [899, 9], [999, 10], [1199, 12], [1299, 8], [1499, 9], [1799, 6], [1999, 5], [2398, 3], [2499, 3], [2999, 2], [3499, 1]] as const;

export type ChannelCode = "WEB" | "MP1" | "MP2" | "MP3" | "QC1" | "QC2";
const CHANNEL_MIX: [ChannelCode, number][] = [["WEB", 45], ["MP1", 15], ["MP2", 12], ["MP3", 8], ["QC1", 12], ["QC2", 8]];
const PREFIX: Record<ChannelCode, string> = { WEB: "ORD-W-", MP1: "ORD-M-", MP2: "ORD-M2-", MP3: "ORD-M3-", QC1: "ORD-Q1-", QC2: "ORD-Q2-" };

export interface GenOrder {
  orderId: string;
  channel: ChannelCode;
  orderDate: string;
  value: Paise;
  paymentMode: "COD" | "Prepaid";
  status: DeliveryStatus;
  statusDate: string | null;
  courier: "CA1" | "CA2" | null;
  awb: string | null;
  weightKg: number | null;
  zone: string | null;
  name: string;
  phone: string;
  address: string;
  pincode: string;
}

export interface GeneratedData {
  asOf: string;
  orders: GenOrder[];
  files: Record<string, { format: SourceFormat; rows: RawRow[] }>;
  truth: { injected: Record<string, number> };
}

export interface GenOptions {
  orders: number;
  asOf: string;
  days?: number; // spread orders over this many days before asOf
  seed?: number;
  includeBriefSamples?: boolean;
}

function fmtDate(iso: string, f: SourceFormat["dateFmt"]): string {
  const [y, m, d] = iso.split("-");
  if (f === "iso") return iso;
  if (f === "dmy-") return `${d}-${m}-${y}`;
  if (f === "dmy/") return `${d}/${m}/${y}`;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${+d}-${MON[+m - 1]}-${y}`;
}
const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtMoney(p: Paise | null, f: SourceFormat["moneyFmt"]): string {
  if (p === null) return "";
  return f === "rupee" ? (p < 0 ? "-" : "") + "₹" + inrFmt.format(Math.abs(p) / 100) : (p / 100).toFixed(2);
}

const STATUS_TEXT: Record<ChannelCode, Record<DeliveryStatus, string>> = {
  WEB: { delivered: "Delivered", rto: "Returned to warehouse", customer_return: "Returned", in_transit: "In Transit", cancelled: "Cancelled" },
  MP1: { delivered: "DELIVERED", rto: "RTO_DELIVERED", customer_return: "RETURN_COMPLETED", in_transit: "SHIPPED", cancelled: "CANCELLED" },
  MP2: { delivered: "delivered", rto: "rto", customer_return: "customer_return", in_transit: "in_transit", cancelled: "cancelled" },
  MP3: { delivered: "Delivered", rto: "RTO Delivered", customer_return: "Customer Return", in_transit: "Out for Delivery", cancelled: "Cancelled" },
  QC1: { delivered: "COMPLETED", rto: "RTO", customer_return: "REFUNDED", in_transit: "DISPATCHED", cancelled: "CANCELLED" },
  QC2: { delivered: "delivered", rto: "rto", customer_return: "returned", in_transit: "pending", cancelled: "cancelled" },
};

export function generate(opts: GenOptions): GeneratedData {
  const r = rng(opts.seed ?? 20261109);
  const days = opts.days ?? 75;
  const asOfDay = dayNumber(opts.asOf);
  const cards = DEFAULT_RATE_CARDS;
  const fmt = new Map(SOURCE_FORMATS.map((s) => [sourceKey(s.partner, s.kind), s]));
  const files: GeneratedData["files"] = {};
  for (const s of SOURCE_FORMATS) files[sourceKey(s.partner, s.kind)] = { format: s, rows: [] };
  const injected: Record<string, number> = {};
  const inject = (k: string) => (injected[k] = (injected[k] ?? 0) + 1);

  const put = (partner: string, kind: FileKind, canonical: Record<string, string | number | null>) => {
    const key = sourceKey(partner, kind);
    const sf = fmt.get(key)!;
    const row: RawRow = {};
    for (const [field, header] of Object.entries(sf.fields)) {
      const v = canonical[field];
      row[header] = v === undefined || v === null ? "" : v;
    }
    files[key].rows.push(row);
  };
  const D = (partner: string, kind: FileKind, iso: string | null) => (iso ? fmtDate(iso, fmt.get(sourceKey(partner, kind))!.dateFmt) : "");
  const M = (partner: string, kind: FileKind, p: Paise | null) => fmtMoney(p, fmt.get(sourceKey(partner, kind))!.moneyFmt);
  const notFuture = (iso: string) => dayNumber(iso) <= asOfDay;

  const orders: GenOrder[] = [];
  const counters: Record<ChannelCode, number> = { WEB: 204000, MP1: 88000, MP2: 310000, MP3: 51000, QC1: 720000, QC2: 930000 };

  const makeOrder = (i: number): GenOrder => {
    const channel = weighted(r, CHANNEL_MIX);
    let id = `${PREFIX[channel]}${counters[channel]++}`;
    if (channel === "WEB" && (id === "ORD-W-204118" || id === "ORD-W-204377")) id = `${PREFIX[channel]}${counters[channel]++}`;
    if (channel === "MP1" && id === "ORD-M-88120") id = `${PREFIX[channel]}${counters[channel]++}`;
    const ageDays = Math.floor(Math.pow(r(), 0.9) * days);
    const orderDate = addDays(opts.asOf, -ageDays);
    const value = rupees(weighted(r, PRICES));
    const web = channel === "WEB";
    const paymentMode = web ? (r() < 0.55 ? "COD" : "Prepaid") : channel.startsWith("MP") && r() < 0.25 ? "COD" : "Prepaid";
    let status: DeliveryStatus;
    if (ageDays < 3) status = r() < 0.7 ? "in_transit" : "delivered";
    else if (web) status = weighted(r, [["delivered", paymentMode === "COD" ? 80 : 92], ["rto", paymentMode === "COD" ? 17 : 5], ["cancelled", 3]] as const);
    else if (channel.startsWith("MP")) status = weighted(r, [["delivered", 87], ["customer_return", 8], ["rto", 2], ["cancelled", 3]] as const);
    else status = weighted(r, [["delivered", 96], ["customer_return", 3], ["cancelled", 1]] as const);
    const lag = status === "rto" ? int(r, 8, 14) : status === "customer_return" ? int(r, 9, 16) : int(r, 1, 5);
    let statusDate: string | null = status === "in_transit" || status === "cancelled" ? null : addDays(orderDate, Math.min(lag, ageDays));
    if (statusDate && !notFuture(statusDate)) statusDate = opts.asOf;
    const v = value / 100;
    const weightKg = web ? Math.round((v <= 600 ? 0.3 + r() * 0.2 : v <= 1500 ? 0.45 + r() * 0.5 : v <= 2500 ? 0.8 + r() * 1.0 : 1.5 + r() * 2.0) * 10) / 10 : null;
    const courier = web ? (r() < 0.55 ? "CA1" : "CA2") : null;
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    return {
      orderId: id,
      channel,
      orderDate,
      value,
      paymentMode,
      status,
      statusDate,
      courier,
      awb: courier ? `${courier}-${String(7700000000 + i * 7919 + int(r, 0, 999)).slice(-10)}` : null,
      weightKg,
      zone: web ? weighted(r, [["A", 22], ["B", 30], ["C", 25], ["D", 15], ["E", 8]] as const) : null,
      name,
      phone: `9${int(r, 100000000, 999999999)}`,
      address: `${int(r, 1, 220)}, ${pick(r, STREETS)}`,
      pincode: pick(r, PINS),
    };
  };

  for (let i = 0; i < opts.orders; i++) orders.push(makeOrder(i));

  if (opts.includeBriefSamples !== false) {
    // The brief's three sample rows, exactly.
    const base = { name: "Sample Customer", phone: "9000000001", address: "1, Sample Street", pincode: "560001" };
    orders.push(
      { ...base, orderId: "ORD-W-204118", channel: "WEB", orderDate: addDays(opts.asOf, -46), value: rupees(1499), paymentMode: "COD", status: "delivered", statusDate: addDays(opts.asOf, -41), courier: "CA1", awb: "CA1-7781204118", weightKg: 0.5, zone: "C" },
      { ...base, orderId: "ORD-M-88120", channel: "MP1", orderDate: addDays(opts.asOf, -44), value: rupees(1199), paymentMode: "Prepaid", status: "delivered", statusDate: addDays(opts.asOf, -40), courier: null, awb: null, weightKg: null, zone: null },
      { ...base, orderId: "ORD-W-204377", channel: "WEB", orderDate: addDays(opts.asOf, -38), value: rupees(2398), paymentMode: "Prepaid", status: "rto", statusDate: addDays(opts.asOf, -27), courier: "CA2", awb: "CA2-5520204377", weightKg: 0.5, zone: "A" },
    );
  }

  const tcsOf = (value: Paise) => Math.round(pctOf(Math.round(value / 1.05), 0.5)); // GST TCS 0.5% of taxable value (5% GST assumed)
  const tdsOf = (value: Paise) => Math.round(pctOf(Math.round(value / 1.05), 0.1)); // TDS u/s 194-O 0.1%

  for (const o of orders) {
    // ---- order file row
    const oc: Record<string, string | number | null> = {
      orderId: o.orderId,
      orderDate: D(o.channel, "orders", o.orderDate),
      value: M(o.channel, "orders", o.value),
      paymentMode: o.paymentMode === "COD" ? (o.channel === "WEB" ? "Cash on Delivery" : "COD") : o.channel === "WEB" ? pick(r, ["UPI", "Card", "Prepaid"]) : "Prepaid",
      deliveryStatus: STATUS_TEXT[o.channel][o.status],
      statusDate: D(o.channel, "orders", o.statusDate),
      courier: o.courier === "CA1" ? "Courier aggregator 1" : o.courier === "CA2" ? "Courier aggregator 2" : null,
      awb: o.awb,
      weightKg: o.weightKg,
      zone: o.zone,
      customerName: o.name,
      customerPhone: o.phone,
      customerAddress: o.address,
      pincode: o.pincode,
    };
    put(o.channel, "orders", oc);
    if (!o.statusDate) continue;
    const isSample = o.orderId === "ORD-W-204118" || o.orderId === "ORD-M-88120" || o.orderId === "ORD-W-204377";
    const returned = o.status === "rto" || o.status === "customer_return";

    // ---- warehouse scans for returns
    if (returned) {
      const lost = isSample ? false : r() < 0.07;
      const scanDate = addDays(o.statusDate, int(r, 1, 6));
      if (lost) inject("return_lost");
      else if (notFuture(scanDate)) {
        const useAwb = o.awb && r() < 0.5;
        put("WH", "returns", { scannedAt: D("WH", "returns", scanDate), orderId: useAwb ? null : o.orderId, awb: useAwb ? o.awb : null, condition: weighted(r, [["Good", 86], ["Damaged", 9], ["Wrong item", 5]] as const) });
      }
    }

    if (o.channel === "WEB") {
      const cc = cards[o.courier!] as CourierCard;
      const pg = cards.PG as GatewayCard;
      // Weight-slab error: courier bills one slab up (or the brief's sample).
      let billedW = o.weightKg!;
      if (o.orderId === "ORD-W-204377") billedW = 1.0;
      else if (!isSample && r() < 0.06) {
        billedW = Math.round((o.weightKg! <= 0.5 ? 0.9 + r() * 0.1 : o.weightKg! + 0.6 + r() * 0.5) * 10) / 10;
        inject("weight_slab_error");
      }
      const fwdB = forwardFreight(cc, o.zone!, billedW);
      const rtoB = returned ? rtoFreight(cc, fwdB) : 0;
      const codB = o.paymentMode === "COD" && !returned ? codFee(cc, o.value) : 0;
      const invDate = addDays(o.statusDate, int(r, 3, 9));
      const totalB = fwdB + rtoB + codB;
      if (notFuture(invDate) && (o.orderId !== "ORD-W-204118")) {
        put(o.courier!, "freight", {
          invoiceNo: `${o.courier}-INV-${invDate.slice(2, 7).replace("-", "")}`,
          invoiceDate: D(o.courier!, "freight", invDate),
          awb: o.awb,
          orderId: r() < 0.3 ? null : o.orderId,
          billedWeightKg: o.courier === "CA2" ? Math.round(billedW * 1000) : billedW,
          zone: o.zone,
          forward: M(o.courier!, "freight", fwdB),
          rto: M(o.courier!, "freight", rtoB),
          codFee: M(o.courier!, "freight", codB),
          total: M(o.courier!, "freight", totalB),
        });
      }
      if (o.paymentMode === "COD" && !returned) {
        const due = addDays(o.statusDate, cc.remittanceCycleDays);
        const remitDate = addDays(due, int(r, -2, 1));
        let unremitted = o.orderId === "ORD-W-204118";
        if (!isSample && dayNumber(due) < asOfDay - 3 && r() < 0.03) {
          unremitted = true;
          inject("cod_unremitted");
        }
        if (!unremitted && notFuture(remitDate)) {
          let remitted = o.value - fwdB - codB;
          if (!isSample && r() < 0.01) {
            remitted -= rupees(int(r, 50, 400));
            inject("cod_short");
          }
          let orderId: string | null = o.orderId;
          let awb: string | null = o.awb;
          if (r() < 0.006) {
            orderId = null;
            awb = o.awb!.slice(0, -2) + String((+o.awb!.slice(-2) + 1) % 100).padStart(2, "0"); // typo'd AWB
            inject("cod_orphan");
          }
          put(o.courier!, "cod", { awb, orderId: r() < 0.5 ? orderId : null, collected: M(o.courier!, "cod", o.value), remitted: M(o.courier!, "cod", remitted), remittanceDate: D(o.courier!, "cod", remitDate), utr: `UTR${int(r, 10000000, 99999999)}` });
          if (!orderId && awb !== o.awb) {
            /* orphan keeps no order ID */
          }
        }
      } else if (o.paymentMode === "Prepaid") {
        const lines = gatewayPrepaid(pg, o.value);
        const net = lines.reduce((a, l) => a + l.amount, 0);
        const fee = o.value - net;
        const sDate = addDays(o.orderDate, int(r, 1, 3));
        const missing = !isSample && r() < 0.004;
        if (missing) inject("pg_missing");
        if (!missing && notFuture(sDate)) {
          put("PG", "settlement", { orderId: o.orderId, settlementRef: `pay_${int(r, 1e9, 9e9).toString(36)}`, settlementDate: D("PG", "settlement", sDate), gross: M("PG", "settlement", o.value), commission: M("PG", "settlement", fee), net: M("PG", "settlement", net) });
          if (returned) {
            const refundDate = addDays(o.statusDate, 1);
            if (notFuture(refundDate)) put("PG", "settlement", { orderId: o.orderId, settlementRef: `rfnd_${int(r, 1e9, 9e9).toString(36)}`, settlementDate: D("PG", "settlement", refundDate), gross: M("PG", "settlement", -o.value), commission: M("PG", "settlement", -fee), net: M("PG", "settlement", -net) });
          }
        }
      }
      continue;
    }

    // ---- marketplace / quick-commerce settlements
    const card = cards[o.channel] as ChannelCard;
    if (!returned) {
      const lines = channelDelivered(card, o.value);
      const due = addDays(o.statusDate, card.paymentCycleDays);
      const sDate = addDays(due, int(r, -3, 0));
      let unpaid = false;
      if (!isSample && dayNumber(due) < asOfDay - 3 && r() < 0.012) {
        unpaid = true;
        inject("channel_unpaid");
      }
      if (unpaid || !notFuture(sDate)) continue;
      const commission = -lines.find((l) => l.label === "Commission")!.amount;
      const fixed = -lines.find((l) => l.label.startsWith("Fixed"))!.amount;
      const ship = -(lines.find((l) => l.label === "Shipping fee")?.amount ?? 0);
      let other = 0;
      if (o.orderId === "ORD-M-88120") other = rupees(37);
      else if (r() < 0.035) {
        other = rupees(int(r, 15, 160));
        inject("channel_short");
      }
      // One realistic tax slip for the TCS & TDS screen: QC2 withheld TCS at 1% instead of 0.5% for payouts 30–60 days ago.
      // TCS is still a claimable credit (counted as received), so this shows up only as a tax variance, never as leakage.
      const tcsDoubled = o.channel === "QC2" && dayNumber(sDate) <= asOfDay - 30 && dayNumber(sDate) > asOfDay - 60;
      const tcs = tcsOf(o.value) * (tcsDoubled ? 2 : 1);
      const tds = tdsOf(o.value);
      const net = o.value - commission - fixed - ship - other - tcs - tds;
      let orderId: string | null = o.orderId;
      if (!isSample && r() < 0.008) {
        const mode = int(r, 0, 2);
        orderId = mode === 0 ? null : mode === 1 ? `${o.orderId}-1` : o.orderId.replace(/^ORD-[A-Z0-9]+-/, "");
        inject("channel_orphan");
      }
      put(o.channel, "settlement", {
        orderId,
        settlementRef: `${o.channel}-STL-${sDate.replace(/-/g, "")}`,
        settlementDate: D(o.channel, "settlement", sDate),
        gross: M(o.channel, "settlement", o.value),
        commission: M(o.channel, "settlement", commission),
        fixedFee: M(o.channel, "settlement", fixed),
        shippingFee: M(o.channel, "settlement", ship),
        otherFees: M(o.channel, "settlement", other),
        tcs: M(o.channel, "settlement", tcs),
        tds: M(o.channel, "settlement", tds),
        net: M(o.channel, "settlement", net),
      });
    } else {
      const sDate = addDays(o.statusDate, int(r, 2, 6));
      if (!notFuture(sDate)) continue;
      let fee = -channelReturned(card).reduce((a, l) => a + l.amount, 0);
      if (r() < 0.05) {
        fee *= 2; // charged twice
        inject("return_fee_double");
      }
      put(o.channel, "settlement", { orderId: o.orderId, settlementRef: `${o.channel}-RTN-${sDate.replace(/-/g, "")}`, settlementDate: D(o.channel, "settlement", sDate), gross: M(o.channel, "settlement", 0), commission: M(o.channel, "settlement", 0), fixedFee: M(o.channel, "settlement", 0), shippingFee: M(o.channel, "settlement", 0), otherFees: M(o.channel, "settlement", fee), tcs: M(o.channel, "settlement", 0), tds: M(o.channel, "settlement", 0), net: M(o.channel, "settlement", -fee) });
    }
  }

  // A few freight lines for shipments we have no order for (billed in error).
  const nGhost = Math.max(2, Math.round(opts.orders * 0.0008));
  for (let i = 0; i < nGhost; i++) {
    const c = pick(r, ["CA1", "CA2"] as const);
    const d = addDays(opts.asOf, -int(r, 5, 40));
    const amt = rupees(int(r, 40, 140));
    put(c, "freight", { invoiceNo: `${c}-INV-${d.slice(2, 7).replace("-", "")}`, invoiceDate: D(c, "freight", d), awb: `${c}-99${int(r, 10000000, 99999999)}`, orderId: null, billedWeightKg: c === "CA2" ? 500 : 0.5, zone: "B", forward: M(c, "freight", amt), rto: M(c, "freight", 0), codFee: M(c, "freight", 0), total: M(c, "freight", amt) });
    inject("freight_unknown_awb");
  }

  void roundToRupee;
  return { asOf: opts.asOf, orders, files, truth: { injected } };
}

/** The Marketplace 1 settlement report after its (fictional) format change — for the AI mapping demo. */
export function mp1SettlementNewFormat(data: GeneratedData, limit = 400): RawRow[] {
  const old = data.files[sourceKey("MP1", "settlement")];
  return old.rows.slice(-limit).map((row) => {
    const out: RawRow = {};
    for (const [field, header] of Object.entries(old.format.fields)) out[MP1_SETTLEMENT_V2_HEADERS[field]] = row[header];
    return out;
  });
}
