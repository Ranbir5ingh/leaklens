import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Money columns are integer paise. Customer PII columns only ever hold masked values. */

export const roleEnum = pgEnum("role", ["finance_exec", "cofounder"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  ok: boolean("ok").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("login_attempts_email_at").on(t.email, t.at)]);

export const partners = pgTable("partners", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
});

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  partnerCode: text("partner_code").notNull().references(() => partners.code),
  kind: text("kind").notNull(),
}, (t) => [uniqueIndex("sources_partner_kind").on(t.partnerCode, t.kind)]);

export const mappingVersions = pgTable("mapping_versions", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sources.id),
  version: integer("version").notNull(),
  mapping: jsonb("mapping").notNull(),
  headers: jsonb("headers").notNull(),
  headerSignature: text("header_signature").notNull(),
  engine: text("engine").notNull(), // gemini+heuristic | heuristic | manual | seed
  model: text("model"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("mapping_versions_source_version").on(t.sourceId, t.version)]);

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sources.id),
  mappingVersionId: integer("mapping_version_id").references(() => mappingVersions.id),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash"),
  rowCount: integer("row_count").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  rejectedSample: jsonb("rejected_sample"),
  status: text("status").notNull().default("processing"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const orders = pgTable("orders", {
  orderId: text("order_id").primaryKey(),
  channel: text("channel").notNull(),
  orderDate: date("order_date").notNull(),
  value: integer("value").notNull(),
  paymentMode: text("payment_mode").notNull(),
  deliveryStatus: text("delivery_status").notNull(),
  statusDate: date("status_date"),
  courier: text("courier"),
  awb: text("awb"),
  weightKg: doublePrecision("weight_kg"),
  zone: text("zone"),
  pincode: text("pincode"),
  customerNameMasked: text("customer_name_masked"),
  customerPhoneMasked: text("customer_phone_masked"),
  uploadId: integer("upload_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("orders_awb").on(t.awb), index("orders_channel").on(t.channel)]);

// Fresh column builders per table (sharing builder instances leaks constraint names across tables).
const partnerRowCols = () => ({
  id: serial("id").primaryKey(),
  partner: text("partner").notNull(),
  orderId: text("order_id"),
  uploadId: integer("upload_id"),
  rowHash: text("row_hash").notNull(),
  linkedOrderId: text("linked_order_id"), // set when a reviewer accepts a suggested match
});

export const settlements = pgTable("settlements", {
  ...partnerRowCols(),
  settlementRef: text("settlement_ref"),
  settlementDate: date("settlement_date").notNull(),
  gross: integer("gross"),
  commission: integer("commission"),
  fixedFee: integer("fixed_fee"),
  shippingFee: integer("shipping_fee"),
  otherFees: integer("other_fees"),
  tcs: integer("tcs").notNull().default(0),
  tds: integer("tds").notNull().default(0),
  net: integer("net").notNull(),
}, (t) => [index("settlements_order").on(t.orderId), uniqueIndex("settlements_row_hash").on(t.rowHash)]);

export const codRemittances = pgTable("cod_remittances", {
  ...partnerRowCols(),
  awb: text("awb"),
  collected: integer("collected"),
  remitted: integer("remitted").notNull(),
  remittanceDate: date("remittance_date").notNull(),
  utr: text("utr"),
}, (t) => [uniqueIndex("cod_remittances_row_hash").on(t.rowHash), index("cod_remittances_awb").on(t.awb)]);

export const freightLines = pgTable("freight_lines", {
  ...partnerRowCols(),
  awb: text("awb"),
  invoiceNo: text("invoice_no"),
  invoiceDate: date("invoice_date").notNull(),
  billedWeightKg: doublePrecision("billed_weight_kg"),
  zone: text("zone"),
  forward: integer("forward"),
  rto: integer("rto"),
  codFee: integer("cod_fee"),
  total: integer("total").notNull(),
}, (t) => [uniqueIndex("freight_lines_row_hash").on(t.rowHash), index("freight_lines_awb").on(t.awb)]);

export const returnScans = pgTable("return_scans", {
  id: serial("id").primaryKey(),
  orderId: text("order_id"),
  awb: text("awb"),
  scannedAt: date("scanned_at").notNull(),
  condition: text("condition"),
  uploadId: integer("upload_id"),
  rowHash: text("row_hash").notNull(),
  linkedOrderId: text("linked_order_id"),
}, (t) => [uniqueIndex("return_scans_row_hash").on(t.rowHash)]);

export const rateCards = pgTable("rate_cards", {
  id: serial("id").primaryKey(),
  partnerCode: text("partner_code").notNull().references(() => partners.code),
  version: integer("version").notNull(),
  card: jsonb("card").notNull(),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("rate_cards_partner_version").on(t.partnerCode, t.version)]);

export const reconRuns = pgTable("recon_runs", {
  id: serial("id").primaryKey(),
  asOf: date("as_of").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  durationMs: integer("duration_ms"),
  timings: jsonb("timings"),
  stats: jsonb("stats"),
  triggeredBy: integer("triggered_by").references(() => users.id),
  trigger: text("trigger"),
});

export const reconResults = pgTable("recon_results", {
  orderId: text("order_id").primaryKey(),
  runId: integer("run_id").notNull(),
  channel: text("channel").notNull(),
  partner: text("partner").notNull(),
  status: text("status").notNull(),
  orderDate: date("order_date").notNull(),
  value: integer("value").notNull(),
  paymentMode: text("payment_mode").notNull(),
  deliveryStatus: text("delivery_status").notNull(),
  expected: integer("expected").notNull(),
  received: integer("received").notNull(),
  difference: integer("difference").notNull(),
  tcs: integer("tcs").notNull(),
  tds: integer("tds").notNull(),
  expectedFreight: integer("expected_freight"),
  billedFreight: integer("billed_freight"),
  dueDate: date("due_date"),
  atRisk: integer("at_risk").notNull(),
  riskSince: date("risk_since"),
  issues: jsonb("issues").notNull(),
  expectedLines: jsonb("expected_lines").notNull(),
  receivedLines: jsonb("received_lines").notNull(),
}, (t) => [index("recon_results_status").on(t.status), index("recon_results_partner").on(t.partner), index("recon_results_risk").on(t.atRisk)]);

export const matchSuggestions = pgTable("match_suggestions", {
  id: serial("id").primaryKey(),
  orphanKind: text("orphan_kind").notNull(),
  orphanRowId: integer("orphan_row_id").notNull(),
  partner: text("partner"),
  orderIdHint: text("order_id_hint"),
  awb: text("awb"),
  amount: integer("amount"),
  orphanDate: date("orphan_date"),
  candidateOrderId: text("candidate_order_id"),
  confidence: real("confidence").notNull(),
  reasons: jsonb("reasons").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | superseded
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("match_suggestions_unique").on(t.orphanKind, t.orphanRowId, t.candidateOrderId), index("match_suggestions_status").on(t.status)]);

export const claims = pgTable("claims", {
  id: serial("id").primaryKey(),
  partner: text("partner").notNull(),
  orderId: text("order_id").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("open"), // open | raised | recovered | rejected | resolved
  recoveredAmount: integer("recovered_amount").notNull().default(0),
  note: text("note"),
  riskSince: date("risk_since"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
}, (t) => [uniqueIndex("claims_order_type").on(t.orderId, t.type), index("claims_partner_status").on(t.partner, t.status)]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).default(sql`now()`).notNull(),
});
