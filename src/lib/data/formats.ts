import type { ColumnMapping } from "@/lib/domain/mapping";
import type { FileKind } from "@/lib/domain/types";

/**
 * How each partner's report looks today (version 1 of every saved mapping). Every partner names
 * columns differently and formats dates and money differently — the realistic mess the column
 * mapping exists to absorb. canonical field → partner column header.
 */
export type DateFmt = "iso" | "dmy-" | "dmy/" | "d-Mon-y";
export interface SourceFormat {
  partner: string;
  kind: FileKind;
  dateFmt: DateFmt;
  moneyFmt: "plain" | "rupee";
  fields: Record<string, string>;
  weightUnit?: "kg" | "g";
}

export const sourceKey = (partner: string, kind: FileKind) => `${partner}:${kind}`;

const F = (partner: string, kind: FileKind, dateFmt: DateFmt, moneyFmt: "plain" | "rupee", fields: Record<string, string>, weightUnit?: "kg" | "g"): SourceFormat => ({ partner, kind, dateFmt, moneyFmt, fields, weightUnit });

export const SOURCE_FORMATS: SourceFormat[] = [
  F("WEB", "orders", "dmy-", "rupee", { orderId: "Order No", orderDate: "Created At", value: "Total Amount", paymentMode: "Payment Method", deliveryStatus: "Shipment Status", statusDate: "Delivered On", courier: "Courier Partner", awb: "AWB Number", weightKg: "Weight (kg)", zone: "Zone", customerName: "Customer Name", customerPhone: "Mobile", customerAddress: "Shipping Address", pincode: "Pin Code" }),
  F("MP1", "orders", "dmy-", "plain", { orderId: "Order ID", orderDate: "Order Date", value: "Selling Price", paymentMode: "Payment Type", deliveryStatus: "Order Status", statusDate: "Status Date", customerName: "Customer", pincode: "Pincode" }),
  F("MP2", "orders", "iso", "plain", { orderId: "order_item_id", orderDate: "order_date", value: "item_total", paymentMode: "payment", deliveryStatus: "current_status", statusDate: "updated_at", customerName: "buyer_name", pincode: "pin" }),
  F("MP3", "orders", "dmy/", "plain", { orderId: "Sub Order ID", orderDate: "Date of Order", value: "Invoice Value", paymentMode: "Mode", deliveryStatus: "Fulfilment Status", statusDate: "Last Status Date" }),
  F("QC1", "orders", "d-Mon-y", "plain", { orderId: "Order Ref", orderDate: "Placed On", value: "GMV", paymentMode: "Pay Mode", deliveryStatus: "Status", statusDate: "Delivered At" }),
  F("QC2", "orders", "iso", "plain", { orderId: "order_id", orderDate: "created", value: "order_value", paymentMode: "pay_mode", deliveryStatus: "state", statusDate: "state_date" }),

  F("MP1", "settlement", "dmy-", "plain", { orderId: "Order ID", settlementRef: "Settlement ID", settlementDate: "Settlement Date", gross: "Sale Amount", commission: "Commission", fixedFee: "Closing Fee", shippingFee: "Shipping Fee", otherFees: "Other Deductions", tcs: "TCS", tds: "TDS", net: "Net Settlement" }),
  F("MP2", "settlement", "iso", "plain", { orderId: "order_item_id", settlementRef: "payout_id", settlementDate: "payout_date", gross: "gross_amount", commission: "marketplace_fee", fixedFee: "fixed_fee", shippingFee: "shipping_charge", otherFees: "adjustments", tcs: "tcs_amount", tds: "tds_amount", net: "net_payout" }),
  F("MP3", "settlement", "dmy/", "rupee", { orderId: "Sub Order ID", settlementRef: "NEFT Ref", settlementDate: "Payment Date", gross: "Item Value", commission: "Referral Fee", fixedFee: "Collection Fee", shippingFee: "Logistics Fee", otherFees: "Penalty", tcs: "GST TCS", tds: "TDS 194O", net: "Bank Transfer" }),
  F("QC1", "settlement", "d-Mon-y", "plain", { orderId: "Order Ref", settlementRef: "Transaction ID", settlementDate: "Value Date", gross: "GMV", commission: "Platform Fee", fixedFee: "Fixed Charge", otherFees: "Misc Charges", tcs: "TCS Deducted", tds: "TDS Deducted", net: "Net Payable" }),
  F("QC2", "settlement", "iso", "plain", { orderId: "order_id", settlementRef: "utr", settlementDate: "settled_on", gross: "order_value", commission: "commission", fixedFee: "fixed_fee", otherFees: "other_charges", tcs: "tcs", tds: "tds", net: "settled_amount" }),
  F("PG", "settlement", "iso", "plain", { orderId: "Merchant Order ID", settlementRef: "Payment Ref", settlementDate: "Settled On", gross: "Amount", commission: "Fee", net: "Settled Amount" }),

  F("CA1", "cod", "dmy-", "plain", { awb: "AWB No", orderId: "Client Order ID", collected: "COD Amount", remitted: "Remitted Amount", remittanceDate: "Remitted On", utr: "UTR No" }),
  F("CA2", "cod", "dmy/", "rupee", { awb: "Tracking ID", orderId: "Reference No", collected: "Collectable Amount", remitted: "Net Remitted", remittanceDate: "Payout Date", utr: "CRF ID" }),
  F("CA1", "freight", "dmy-", "plain", { invoiceNo: "Invoice No", invoiceDate: "Invoice Date", awb: "AWB No", orderId: "Client Order ID", billedWeightKg: "Charged Weight", zone: "Zone", forward: "Forward Charge", rto: "RTO Charge", codFee: "COD Charge", total: "Total Charge" }, "kg"),
  F("CA2", "freight", "dmy/", "plain", { invoiceNo: "Bill No", invoiceDate: "Bill Date", awb: "Waybill", orderId: "Reference No", billedWeightKg: "Applied Weight (g)", zone: "Applied Zone", forward: "Freight", rto: "RTO Freight", codFee: "COD Handling", total: "Invoice Amount" }, "g"),
  F("WH", "returns", "dmy-", "plain", { scannedAt: "Inward Date", orderId: "Order Number", awb: "AWB", condition: "QC Result" }),
];

export function formatToMapping(sf: SourceFormat): ColumnMapping {
  return { fields: { ...sf.fields }, ...(sf.weightUnit ? { weightUnit: sf.weightUnit } : {}) };
}

/**
 * The "format changed without notice" demo: Marketplace 1 renamed every settlement column.
 * Uploading /samples/mp1-settlement-new-format.csv triggers AI mapping suggestions.
 */
export const MP1_SETTLEMENT_V2_HEADERS: Record<string, string> = {
  orderId: "Sub Order No",
  settlementRef: "Payout Reference",
  settlementDate: "Payout Date",
  gross: "Item Sale Value",
  commission: "Referral Fee",
  fixedFee: "Closing Fee",
  shippingFee: "Shipping Fee",
  otherFees: "Adjustments",
  tcs: "GST TCS",
  tds: "TDS (194-O)",
  net: "Net Payout",
};
