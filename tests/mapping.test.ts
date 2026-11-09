import { describe, expect, it } from "vitest";
import { headerSignature, missingMappedHeaders, normalizeRow, parseDeliveryStatus, parsePaymentMode, validateMapping } from "@/lib/domain/mapping";
import { suggestMappingHeuristic, suggestionToMapping } from "@/lib/domain/heuristic-mapper";
import { merge } from "@/lib/ai/gemini-mapper";
import { maskName, maskPhone, redactForAI } from "@/lib/domain/pii";
import { parseMoney } from "@/lib/domain/money";
import { parseDate } from "@/lib/domain/dates";

describe("value parsing", () => {
  it("parses Indian money formats", () => {
    expect(parseMoney("₹1,409.00")).toBe(140900);
    expect(parseMoney("Rs. 862")).toBe(86200);
    expect(parseMoney("(37.00)")).toBe(-3700);
    expect(parseMoney("-46")).toBe(-4600);
    expect(parseMoney("1,00,000")).toBe(10000000);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("parses dates day-first", () => {
    expect(parseDate("03/10/2026")).toBe("2026-10-03");
    expect(parseDate("3-Oct-2026")).toBe("2026-10-03");
    expect(parseDate("2026-10-03 14:22")).toBe("2026-10-03");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate(46298)).toBe("2026-10-03");
  });
  it("folds delivery status and payment spellings", () => {
    expect(parseDeliveryStatus("Returned to warehouse")).toBe("rto");
    expect(parseDeliveryStatus("RTO Delivered")).toBe("rto");
    expect(parseDeliveryStatus("RTO_DELIVERED")).toBe("rto");
    expect(parseDeliveryStatus("RETURN_COMPLETED")).toBe("customer_return");
    expect(parseDeliveryStatus("Customer Return")).toBe("customer_return");
    expect(parseDeliveryStatus("Delivered")).toBe("delivered");
    expect(parseDeliveryStatus("Out for delivery")).toBe("in_transit");
    expect(parsePaymentMode("Cash on Delivery")).toBe("COD");
    expect(parsePaymentMode("UPI")).toBe("Prepaid");
    expect(parsePaymentMode("barter")).toBeNull();
  });
});

describe("PII masking (DPDP)", () => {
  it("masks names and phones, idempotently", () => {
    expect(maskName("Priya Sharma")).toBe("P•••• S••••");
    expect(maskName(maskName("Priya Sharma"))).toBe("P•••• S••••");
    expect(maskPhone("+91 98450 12345")).toBe("••••••2345");
    expect(maskPhone(maskPhone("9845012345"))).toBe("••••••2345");
  });
  it("redacts sample values sent to AI", () => {
    expect(redactForAI("Customer Name", "Priya Sharma")).toBe("[redacted]");
    expect(redactForAI("Notes", "call 9845012345")).toBe("call [phone]");
    expect(redactForAI("Order ID", "ORD-W-1")).toBe("ORD-W-1");
  });
});

const websiteHeaders = ["Order No", "Created At", "Total Amount", "Payment Method", "Shipment Status", "Delivered On", "Courier Partner", "AWB Number", "Weight (kg)", "Zone", "Customer Name", "Mobile", "Shipping Address", "Pin Code"];
const websiteRow = { "Order No": "ORD-W-204118", "Created At": "24-09-2026", "Total Amount": "1,499.00", "Payment Method": "COD", "Shipment Status": "Delivered", "Delivered On": "29-09-2026", "Courier Partner": "Courier aggregator 1", "AWB Number": "CA1-7781204118", "Weight (kg)": "0.5", Zone: "C", "Customer Name": "Priya Sharma", Mobile: "9845012345", "Shipping Address": "12 MG Road", "Pin Code": "560001" };

describe("column mapping", () => {
  it("heuristic maps a typical website export correctly", () => {
    const s = suggestMappingHeuristic("orders", websiteHeaders, [websiteRow]);
    const m = suggestionToMapping(s);
    expect(m.fields).toMatchObject({ orderId: "Order No", orderDate: "Created At", value: "Total Amount", paymentMode: "Payment Method", deliveryStatus: "Shipment Status", statusDate: "Delivered On", courier: "Courier Partner", awb: "AWB Number", weightKg: "Weight (kg)", zone: "Zone", customerPhone: "Mobile", pincode: "Pin Code" });
    expect(validateMapping("orders", m, websiteHeaders)).toEqual([]);
  });

  it("heuristic maps a renamed settlement format", () => {
    const headers = ["Sub Order ID", "Payout Date", "Sale Amount", "Referral Fee", "Closing Fee", "Logistics Fee", "Adjustments", "GST TCS", "TDS 194O", "Net Payout", "Payout ID"];
    const m = suggestionToMapping(suggestMappingHeuristic("settlement", headers, [{ "Sub Order ID": "ORD-M-88120", "Payout Date": "10/10/2026", "Sale Amount": "1199", "Referral Fee": "240", "Closing Fee": "60", "Logistics Fee": "0", Adjustments: "37", "GST TCS": "5.71", "TDS 194O": "1.20", "Net Payout": "855.09", "Payout ID": "P1" }]));
    expect(m.fields).toMatchObject({ orderId: "Sub Order ID", settlementDate: "Payout Date", gross: "Sale Amount", commission: "Referral Fee", fixedFee: "Closing Fee", shippingFee: "Logistics Fee", otherFees: "Adjustments", tcs: "GST TCS", tds: "TDS 194O", net: "Net Payout", settlementRef: "Payout ID" });
  });

  it("normalises a row, masks PII and drops the address", () => {
    const m = suggestionToMapping(suggestMappingHeuristic("orders", websiteHeaders, [websiteRow]));
    const { value, errors } = normalizeRow("orders", m, websiteRow);
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ orderId: "ORD-W-204118", value: 149900, paymentMode: "COD", deliveryStatus: "delivered", courier: "CA1", weightKg: 0.5, zone: "C", customerName: "P•••• S••••", customerPhone: "••••••2345", customerAddress: null });
  });

  it("reports bad cells with the field name instead of storing garbage", () => {
    const m = suggestionToMapping(suggestMappingHeuristic("orders", websiteHeaders, [websiteRow]));
    const { errors } = normalizeRow("orders", m, { ...websiteRow, "Total Amount": "N/A", "Created At": "yesterday" });
    expect(errors.map((e) => e.field).sort()).toEqual(["orderDate", "value"]);
  });

  it("converts grams to kg when the header says grams", () => {
    const { value } = normalizeRow("freight", { fields: { awb: "AWB", invoiceDate: "Date", billedWeightKg: "Charged Weight (g)", total: "Total" } }, { AWB: "X", Date: "2026-10-01", "Charged Weight (g)": "1000", Total: "142" });
    expect(value.billedWeightKg).toBe(1);
  });

  it("detects a changed format via the header signature", () => {
    const m = { fields: { orderId: "Order No", value: "Total Amount" } };
    expect(missingMappedHeaders(m, websiteHeaders)).toEqual([]);
    expect(missingMappedHeaders(m, ["Order Number", "Total Amount"])).toEqual(["Order No"]);
    expect(headerSignature(["B", "a"])).toBe(headerSignature(["A ", "b"]));
  });

  it("rejects a mapping that uses one column twice or misses required fields", () => {
    const errs = validateMapping("settlement", { fields: { orderId: "Net", net: "Net" } }, ["Net"]);
    expect(errs.join(" ")).toMatch(/Settlement date is required/);
    expect(errs.join(" ")).toMatch(/mapped to two fields/);
  });
});

describe("AI answer handling (no network)", () => {
  const headers = ["Sub Order ID", "Payout Date", "Net Payout"];
  const heur = suggestMappingHeuristic("settlement", headers, []);

  it("drops hallucinated columns and flags disagreement as unsure", () => {
    const out = merge("settlement", headers, { mappings: [
      { field: "orderId", header: "Order Reference", confidence: 0.9, reason: "" },
      { field: "net", header: "Net Payout", confidence: 0.95, reason: "net amount" },
      { field: "settlementDate", header: "Sub Order ID", confidence: 0.8, reason: "wrong" },
    ] }, heur);
    expect(out.warnings[0]).toMatch(/not in the file/);
    const byField = Object.fromEntries(out.fields.map((f) => [f.field, f]));
    expect(byField.orderId.header).toBeNull();
    expect(byField.net.confidence).toBeGreaterThan(0.9);
    expect(byField.settlementDate.confidence).toBeLessThanOrEqual(0.6);
    expect(byField.settlementDate.alternatives).toContain("Payout Date");
  });

  it("never lets one column feed two fields", () => {
    const out = merge("settlement", headers, { mappings: [
      { field: "net", header: "Net Payout", confidence: 0.9, reason: "" },
      { field: "gross", header: "Net Payout", confidence: 0.5, reason: "" },
    ] }, heur);
    const used = out.fields.filter((f) => f.header === "Net Payout");
    expect(used).toHaveLength(1);
    expect(used[0].field).toBe("net");
  });
});
