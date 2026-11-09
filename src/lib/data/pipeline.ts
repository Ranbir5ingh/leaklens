import { normalizeRow, type Canonical, type ColumnMapping, type RawRow, type RowError } from "@/lib/domain/mapping";
import type { CodRow, DeliveryStatus, FileKind, FreightRow, OrderRow, PaymentMode, ReturnScanRow, SettlementRow } from "@/lib/domain/types";

/**
 * Canonical record → typed engine row. Shared by the server upload route, the seed script and the
 * benchmark, so all three go through exactly the same validation.
 */
export function toOrder(partner: string, v: Canonical): OrderRow & { pincode: string | null; customerName: string | null; customerPhone: string | null } {
  return {
    orderId: String(v.orderId),
    channel: partner,
    orderDate: String(v.orderDate),
    value: Number(v.value),
    paymentMode: v.paymentMode as PaymentMode,
    deliveryStatus: v.deliveryStatus as DeliveryStatus,
    statusDate: (v.statusDate as string) ?? null,
    courier: (v.courier as string) ?? null,
    awb: (v.awb as string) ?? null,
    weightKg: v.weightKg === null || v.weightKg === undefined ? null : Number(v.weightKg),
    zone: (v.zone as string) ?? null,
    pincode: (v.pincode as string) ?? null,
    customerName: (v.customerName as string) ?? null,
    customerPhone: (v.customerPhone as string) ?? null,
  };
}

const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));

export function toSettlement(partner: string, v: Canonical): SettlementRow {
  return {
    partner,
    orderId: (v.orderId as string) ?? null,
    settlementRef: (v.settlementRef as string) ?? null,
    settlementDate: String(v.settlementDate),
    gross: n(v.gross),
    commission: n(v.commission),
    fixedFee: n(v.fixedFee),
    shippingFee: n(v.shippingFee),
    otherFees: n(v.otherFees),
    tcs: n(v.tcs) ?? 0,
    tds: n(v.tds) ?? 0,
    net: Number(v.net),
  };
}

export function toCod(partner: string, v: Canonical): CodRow {
  return { partner, awb: (v.awb as string) ?? null, orderId: (v.orderId as string) ?? null, collected: n(v.collected), remitted: Number(v.remitted), remittanceDate: String(v.remittanceDate), utr: (v.utr as string) ?? null };
}

export function toFreight(partner: string, v: Canonical): FreightRow {
  return {
    partner,
    awb: (v.awb as string) ?? null,
    orderId: (v.orderId as string) ?? null,
    invoiceNo: (v.invoiceNo as string) ?? null,
    invoiceDate: String(v.invoiceDate),
    billedWeightKg: n(v.billedWeightKg),
    zone: (v.zone as string) ?? null,
    forward: n(v.forward),
    rto: n(v.rto),
    codFee: n(v.codFee),
    total: Number(v.total),
  };
}

export function toReturnScan(v: Canonical): ReturnScanRow {
  return { orderId: (v.orderId as string) ?? null, awb: (v.awb as string) ?? null, scannedAt: String(v.scannedAt), condition: (v.condition as string) ?? null };
}

export interface Parsed<T> {
  rows: T[];
  rejected: { row: number; errors: RowError[] }[];
}

/** Normalise and type a whole file. Row numbers are 1-based data rows (header excluded) + 1 = sheet row. */
export function parseFile(kind: FileKind, partner: string, mapping: ColumnMapping, raw: RawRow[]): Parsed<OrderRow | SettlementRow | CodRow | FreightRow | ReturnScanRow> {
  const rows: (OrderRow | SettlementRow | CodRow | FreightRow | ReturnScanRow)[] = [];
  const rejected: Parsed<unknown>["rejected"] = [];
  for (let i = 0; i < raw.length; i++) {
    const { value, errors } = normalizeRow(kind, mapping, raw[i]);
    if (errors.length) {
      rejected.push({ row: i + 2, errors });
      continue;
    }
    rows.push(typed(kind, partner, value));
  }
  return { rows, rejected };
}

export function typed(kind: FileKind, partner: string, v: Canonical) {
  switch (kind) {
    case "orders":
      return toOrder(partner, v);
    case "settlement":
      return toSettlement(partner, v);
    case "cod":
      return toCod(partner, v);
    case "freight":
      return toFreight(partner, v);
    case "returns":
      return toReturnScan(v);
  }
}
