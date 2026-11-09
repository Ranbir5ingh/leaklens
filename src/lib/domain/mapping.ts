import { parseDate } from "./dates";
import { parseMoney, type Paise } from "./money";
import { maskName, maskPhone } from "./pii";
import type { DeliveryStatus, FileKind, PaymentMode } from "./types";

/**
 * Canonical fields per file kind. A saved column mapping says, for one source (partner + file
 * kind), which column header in the partner's file feeds each canonical field.
 */
export type FieldType = "id" | "text" | "money" | "date" | "number" | "payment" | "status" | "courier" | "pii_name" | "pii_phone" | "pii_address";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  hint: string;
  synonyms: string[];
}

const f = (key: string, label: string, type: FieldType, required: boolean, hint: string, synonyms: string[]): FieldDef => ({ key, label, type, required, hint, synonyms });

export const FIELDS: Record<FileKind, FieldDef[]> = {
  orders: [
    f("orderId", "Order ID", "id", true, "Our order number, e.g. ORD-W-204118", ["order id", "order no", "order number", "orderid", "order ref", "sub order id", "suborder id", "order item id", "channel order id", "reference no"]),
    f("orderDate", "Order date", "date", true, "Date the order was placed", ["order date", "created at", "order created", "date", "placed on", "order placed date"]),
    f("value", "Order value", "money", true, "Selling price incl. GST", ["order value", "value", "amount", "total", "order total", "selling price", "invoice value", "gmv", "item total", "total amount"]),
    f("paymentMode", "Payment mode", "payment", true, "COD or Prepaid", ["payment", "payment mode", "payment method", "payment type", "mode", "cod/prepaid", "pay mode"]),
    f("deliveryStatus", "Delivery status", "status", true, "Delivered, RTO, Returned…", ["delivery status", "status", "shipment status", "order status", "fulfilment status", "current status"]),
    f("statusDate", "Status date", "date", false, "Date delivered or returned", ["status date", "delivered date", "delivery date", "delivered on", "last status date", "return date", "updated at"]),
    f("courier", "Courier", "courier", false, "Courier aggregator (website orders)", ["courier", "courier partner", "logistics partner", "carrier", "shipping partner", "aggregator"]),
    f("awb", "AWB", "id", false, "Air waybill / tracking number", ["awb", "awb no", "awb number", "tracking id", "tracking number", "waybill"]),
    f("weightKg", "Declared weight (kg)", "number", false, "Weight declared at booking", ["weight", "weight kg", "declared weight", "dead weight", "package weight", "wt", "weight (kg)", "weight g", "weight (g)"]),
    f("zone", "Zone", "text", false, "Courier zone A–E", ["zone", "shipping zone", "delivery zone"]),
    f("pincode", "Pincode", "text", false, "Delivery pincode", ["pincode", "pin code", "pin", "postal code", "zip"]),
    f("customerName", "Customer name", "pii_name", false, "Masked before storage", ["customer name", "name", "buyer name", "consignee name", "customer", "ship to name"]),
    f("customerPhone", "Customer phone", "pii_phone", false, "Masked before storage", ["phone", "mobile", "customer phone", "contact", "phone number", "mobile no", "customer mobile"]),
    f("customerAddress", "Customer address", "pii_address", false, "Never stored", ["address", "shipping address", "customer address", "delivery address", "address line 1"]),
  ],
  settlement: [
    f("orderId", "Order ID", "id", false, "May be blank — then it goes to the review queue", ["order id", "order no", "order number", "orderid", "order item id", "sub order id", "merchant order id", "order ref", "reference"]),
    f("settlementRef", "Settlement ref", "text", false, "Payout / UTR / settlement ID", ["settlement id", "settlement ref", "payout id", "utr", "neft ref", "transaction id", "settlement reference", "payment ref"]),
    f("settlementDate", "Settlement date", "date", true, "Date money was paid", ["settlement date", "payout date", "payment date", "settled on", "date", "value date", "transfer date"]),
    f("gross", "Gross / sale amount", "money", false, "Sale value before deductions", ["gross", "sale amount", "order value", "gross amount", "selling price", "item value", "amount"]),
    f("commission", "Commission", "money", false, "", ["commission", "commission fee", "marketplace fee", "referral fee", "platform fee"]),
    f("fixedFee", "Fixed / closing fee", "money", false, "", ["fixed fee", "closing fee", "collection fee", "fixed charge"]),
    f("shippingFee", "Shipping fee", "money", false, "", ["shipping fee", "shipping charge", "logistics fee", "delivery fee", "shipping"]),
    f("otherFees", "Other deductions", "money", false, "", ["other fees", "other deductions", "adjustments", "misc charges", "penalty", "other charges", "deductions"]),
    f("tcs", "TCS (GST)", "money", false, "Shown separately, not leakage", ["tcs", "gst tcs", "tcs amount", "tcs deducted", "tax collected at source"]),
    f("tds", "TDS (194-O)", "money", false, "Shown separately, not leakage", ["tds", "tds amount", "tds 194o", "tds deducted", "income tax tds", "tax deducted at source"]),
    f("net", "Net paid", "money", true, "Amount that reached the bank", ["net", "net amount", "net payout", "net settlement", "settled amount", "payout amount", "amount paid", "net payable", "bank transfer"]),
  ],
  cod: [
    f("awb", "AWB", "id", true, "Tracking number", ["awb", "awb no", "awb number", "tracking id", "waybill", "tracking number"]),
    f("orderId", "Order ID", "id", false, "", ["order id", "order no", "order number", "channel order id", "reference no", "client order id"]),
    f("collected", "COD collected", "money", false, "Cash collected from customer", ["cod amount", "collected", "cod collected", "collectable amount", "cod value"]),
    f("remitted", "Remitted amount", "money", true, "Amount paid to us after deductions", ["remitted", "remitted amount", "remittance amount", "net remitted", "amount remitted", "payout"]),
    f("remittanceDate", "Remittance date", "date", true, "", ["remittance date", "remitted on", "payout date", "date", "utr date", "transfer date"]),
    f("utr", "UTR / ref", "text", false, "Bank reference", ["utr", "utr no", "bank ref", "remittance id", "crf id", "reference"]),
  ],
  freight: [
    f("awb", "AWB", "id", true, "Tracking number", ["awb", "awb no", "awb number", "tracking id", "waybill"]),
    f("orderId", "Order ID", "id", false, "", ["order id", "order no", "channel order id", "reference no", "client order id"]),
    f("invoiceNo", "Invoice no.", "text", false, "", ["invoice no", "invoice number", "bill no", "invoice id"]),
    f("invoiceDate", "Invoice date", "date", true, "", ["invoice date", "bill date", "date", "billing date"]),
    f("billedWeightKg", "Billed weight (kg)", "number", false, "Weight the courier charged for", ["billed weight", "charged weight", "chargeable weight", "applied weight", "weight", "billed wt"]),
    f("zone", "Zone", "text", false, "", ["zone", "billing zone", "applied zone"]),
    f("forward", "Forward charge", "money", false, "", ["forward charge", "freight", "forward freight", "fwd charge", "shipping charge"]),
    f("rto", "RTO charge", "money", false, "", ["rto charge", "rto freight", "return charge", "rto"]),
    f("codFee", "COD fee", "money", false, "", ["cod charge", "cod fee", "cod charges", "cod handling"]),
    f("total", "Total billed", "money", true, "", ["total", "total charge", "total amount", "invoice amount", "net amount", "total freight", "amount"]),
  ],
  returns: [
    f("orderId", "Order ID", "id", false, "Order ID or AWB required", ["order id", "order no", "order number", "reference"]),
    f("awb", "AWB", "id", false, "Order ID or AWB required", ["awb", "awb no", "tracking id", "waybill"]),
    f("scannedAt", "Scanned at", "date", true, "Warehouse receipt scan time", ["scanned at", "scan date", "received at", "receipt date", "grn date", "inward date", "date"]),
    f("condition", "Condition", "text", false, "Good / Damaged / Wrong item", ["condition", "qc status", "item condition", "remarks", "qc result"]),
  ],
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  orders: "Orders",
  settlement: "Settlement",
  cod: "COD remittance",
  freight: "Freight invoice",
  returns: "Warehouse return scans",
};

/** fields: canonical key → source header (or null when the file has no such column). */
export interface ColumnMapping {
  fields: Record<string, string | null>;
  weightUnit?: "kg" | "g";
}

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Stable fingerprint of a file's header row, used to detect a partner changing its format. */
export function headerSignature(headers: string[]): string {
  return [...headers].map(normHeader).filter(Boolean).sort().join("|");
}

/** Does a saved mapping still fit these headers? Returns the mapped headers that are now missing. */
export function missingMappedHeaders(mapping: ColumnMapping, headers: string[]): string[] {
  const set = new Set(headers.map(normHeader));
  return Object.values(mapping.fields).filter((h): h is string => !!h && !set.has(normHeader(h)));
}

export function validateMapping(kind: FileKind, mapping: ColumnMapping, headers: string[]): string[] {
  const errors: string[] = [];
  const set = new Set(headers.map(normHeader));
  for (const fd of FIELDS[kind]) {
    const h = mapping.fields[fd.key];
    if (fd.required && !h) errors.push(`${fd.label} is required`);
    if (h && !set.has(normHeader(h))) errors.push(`Column "${h}" for ${fd.label} is not in this file`);
  }
  if ((kind === "returns" || kind === "cod") && !mapping.fields.orderId && !mapping.fields.awb) errors.push("Map Order ID or AWB");
  const used = Object.values(mapping.fields).filter(Boolean).map((h) => normHeader(h!));
  const dup = used.find((h, i) => used.indexOf(h) !== i);
  if (dup) errors.push(`Column "${dup}" is mapped to two fields`);
  return errors;
}

const STATUS_WORDS: [DeliveryStatus, RegExp][] = [
  ["cancelled", /cancel/],
  ["rto", /\brto\b|returned to (warehouse|origin|seller)|return to origin|rto delivered/],
  ["customer_return", /return|refund/],
  ["in_transit", /transit|dispatch|out for|pending|manifest|picked|ofd|booked|^shipped$/],
  ["delivered", /deliver|complete/],
];

export function parseDeliveryStatus(raw: unknown): DeliveryStatus | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return null;
  for (const [k, re] of STATUS_WORDS) if (re.test(s)) return k;
  return null;
}

export function parsePaymentMode(raw: unknown): PaymentMode | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/^(cod|cash|cash on delivery|c\.o\.d\.?|postpaid)$/.test(s) || s.includes("cash on")) return "COD";
  if (/prepaid|online|paid|upi|card|net ?banking|wallet|razorpay|pg/.test(s)) return "Prepaid";
  return null;
}

/** Map courier names in website order exports onto our partner codes. */
export function parseCourier(raw: unknown): string | null {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  if (s === "ca1" || s.includes("aggregator1") || s.endsWith("1")) return "CA1";
  if (s === "ca2" || s.includes("aggregator2") || s.endsWith("2")) return "CA2";
  return null;
}

export type Cell = string | number | boolean | Date | null | undefined;
export type RawRow = Record<string, Cell>;
export type Canonical = Record<string, string | number | null>;
export interface RowError {
  field: string;
  message: string;
}

/**
 * Apply a mapping to one raw row and validate it. Used both for the 20-row preview (browser) and
 * for ingestion (server), so what the user approved is exactly what gets stored.
 */
export function normalizeRow(kind: FileKind, mapping: ColumnMapping, raw: RawRow): { value: Canonical; errors: RowError[] } {
  const value: Canonical = {};
  const errors: RowError[] = [];
  const byNorm = new Map<string, Cell>();
  for (const [k, v] of Object.entries(raw)) byNorm.set(normHeader(k), v);

  for (const fd of FIELDS[kind]) {
    const header = mapping.fields[fd.key];
    const cell = header ? byNorm.get(normHeader(header)) : undefined;
    const empty = cell === undefined || cell === null || (typeof cell === "string" && cell.trim() === "");
    if (empty) {
      value[fd.key] = null;
      if (fd.required) errors.push({ field: fd.key, message: `${fd.label} is empty` });
      continue;
    }
    switch (fd.type) {
      case "id":
      case "text": {
        const s = String(cell).trim().slice(0, 120);
        value[fd.key] = s;
        break;
      }
      case "money": {
        const p = parseMoney(cell);
        if (p === null) errors.push({ field: fd.key, message: `${fd.label}: "${String(cell).slice(0, 20)}" is not an amount` });
        else if (Math.abs(p) > 1_00_00_000_00) errors.push({ field: fd.key, message: `${fd.label} is implausibly large` });
        value[fd.key] = p;
        break;
      }
      case "date": {
        const d = parseDate(cell);
        if (!d) errors.push({ field: fd.key, message: `${fd.label}: "${String(cell).slice(0, 20)}" is not a date` });
        value[fd.key] = d;
        break;
      }
      case "number": {
        const n = typeof cell === "number" ? cell : parseFloat(String(cell).replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(n) || n < 0) {
          errors.push({ field: fd.key, message: `${fd.label}: "${String(cell).slice(0, 20)}" is not a number` });
          value[fd.key] = null;
        } else {
          const grams = mapping.weightUnit === "g" || (mapping.weightUnit === undefined && /\bg\b|gram/i.test(header ?? ""));
          value[fd.key] = Math.round((grams ? n / 1000 : n) * 1000) / 1000;
        }
        break;
      }
      case "payment": {
        const p = parsePaymentMode(cell);
        if (!p) errors.push({ field: fd.key, message: `Payment "${String(cell).slice(0, 20)}" is not COD or Prepaid` });
        value[fd.key] = p;
        break;
      }
      case "status": {
        const s = parseDeliveryStatus(cell);
        if (!s) errors.push({ field: fd.key, message: `Status "${String(cell).slice(0, 24)}" is not recognised` });
        value[fd.key] = s;
        break;
      }
      case "courier": {
        const c = parseCourier(cell);
        if (!c) errors.push({ field: fd.key, message: `Courier "${String(cell).slice(0, 24)}" is unknown` });
        value[fd.key] = c;
        break;
      }
      case "pii_name":
        value[fd.key] = maskName(String(cell));
        break;
      case "pii_phone":
        value[fd.key] = maskPhone(String(cell));
        break;
      case "pii_address":
        value[fd.key] = null; // never stored
        break;
    }
  }
  if ((kind === "returns" || kind === "cod") && !value.orderId && !value.awb) errors.push({ field: "orderId", message: "Needs an Order ID or AWB" });
  if (kind === "orders" && value.zone) value.zone = String(value.zone).toUpperCase().replace(/^ZONE\s*/, "").slice(0, 3);
  if (kind === "freight" && value.zone) value.zone = String(value.zone).toUpperCase().replace(/^ZONE\s*/, "").slice(0, 3);
  return { value, errors };
}

/** Browser-side pre-upload step: keep only mapped columns, as canonical values, with PII masked. */
export function minimiseRows(kind: FileKind, mapping: ColumnMapping, rows: RawRow[]) {
  return rows.map((r) => normalizeRow(kind, mapping, r));
}

export type { Paise };
