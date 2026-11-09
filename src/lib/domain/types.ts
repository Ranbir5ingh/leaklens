import type { Paise } from "./money";

export type PartnerKind = "website" | "marketplace" | "quick_commerce" | "courier" | "payment_gateway" | "warehouse";
export type FileKind = "orders" | "settlement" | "cod" | "freight" | "returns";
export type PaymentMode = "COD" | "Prepaid";

/**
 * Normalised delivery states. Partner files use many spellings; mapping.ts folds them into these.
 * - delivered: reached the customer
 * - rto: returned to origin (never delivered), courier brings it back
 * - customer_return: delivered, then returned by the customer
 * - in_transit / cancelled: excluded from money checks
 */
export type DeliveryStatus = "delivered" | "rto" | "customer_return" | "in_transit" | "cancelled";

export interface OrderRow {
  orderId: string;
  channel: string; // partner code, e.g. WEB, MP1
  orderDate: string; // ISO yyyy-mm-dd
  value: Paise;
  paymentMode: PaymentMode;
  deliveryStatus: DeliveryStatus;
  statusDate: string | null; // delivered / returned date
  courier: string | null; // courier partner code for website orders
  awb: string | null;
  weightKg: number | null; // declared weight
  zone: string | null; // courier zone A-E
}

export interface SettlementRow {
  id?: number;
  partner: string; // MP1, QC1, PG...
  orderId: string | null;
  settlementRef: string | null;
  settlementDate: string;
  gross: Paise | null;
  commission: Paise | null;
  fixedFee: Paise | null;
  shippingFee: Paise | null;
  otherFees: Paise | null;
  tcs: Paise;
  tds: Paise;
  net: Paise;
}

export interface CodRow {
  id?: number;
  partner: string; // courier code
  awb: string | null;
  orderId: string | null;
  collected: Paise | null;
  remitted: Paise;
  remittanceDate: string;
  utr: string | null;
}

export interface FreightRow {
  id?: number;
  partner: string; // courier code
  awb: string | null;
  orderId: string | null;
  invoiceNo: string | null;
  invoiceDate: string;
  billedWeightKg: number | null;
  zone: string | null;
  forward: Paise | null;
  rto: Paise | null;
  codFee: Paise | null;
  total: Paise;
}

export interface ReturnScanRow {
  id?: number;
  orderId: string | null;
  awb: string | null;
  scannedAt: string;
  condition: string | null;
}

export type ReconStatus =
  | "settled"
  | "short_paid"
  | "unpaid_past_due"
  | "freight_overcharged"
  | "return_not_received"
  | "awaiting_payment";

export const STATUS_LABEL: Record<ReconStatus, string> = {
  settled: "Settled",
  short_paid: "Short-paid",
  unpaid_past_due: "Unpaid past due",
  freight_overcharged: "Freight overcharged",
  return_not_received: "Return not received",
  awaiting_payment: "Not yet due",
};

/** Statuses that put money at risk and become claim candidates. */
export const RISK_STATUSES: ReconStatus[] = ["short_paid", "unpaid_past_due", "freight_overcharged", "return_not_received"];

export interface ExpectedLine {
  label: string;
  amount: Paise; // signed: +inflow, −deduction
  rule: string; // human readable rule reference from the rate card
}

export interface ReceivedLine {
  label: string;
  amount: Paise;
  source: "settlement" | "cod" | "freight";
  ref: string | null;
  date: string | null;
}

export interface Issue {
  type: Exclude<ReconStatus, "settled" | "awaiting_payment"> | "overpaid";
  amount: Paise; // money at risk for this issue (positive)
  message: string;
  since: string | null; // date the issue became actionable (for ageing)
}

export interface ReconResult {
  orderId: string;
  channel: string;
  partner: string; // who owes us: channel for marketplaces/QC, courier for COD, PG for prepaid website
  status: ReconStatus;
  expected: Paise;
  received: Paise;
  difference: Paise; // received − expected
  tcs: Paise;
  tds: Paise;
  expectedFreight: Paise | null;
  billedFreight: Paise | null;
  dueDate: string | null;
  atRisk: Paise; // primary issue amount (0 when settled)
  riskSince: string | null;
  issues: Issue[];
  expectedLines: ExpectedLine[];
  receivedLines: ReceivedLine[];
}
