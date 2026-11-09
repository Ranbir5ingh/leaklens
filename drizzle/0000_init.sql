CREATE TYPE "public"."role" AS ENUM('finance_exec', 'cofounder');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"order_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"recovered_amount" integer DEFAULT 0 NOT NULL,
	"note" text,
	"risk_since" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "cod_remittances" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"order_id" text,
	"upload_id" integer,
	"row_hash" text NOT NULL,
	"linked_order_id" text,
	"awb" text,
	"collected" integer,
	"remitted" integer NOT NULL,
	"remittance_date" date NOT NULL,
	"utr" text
);
--> statement-breakpoint
CREATE TABLE "freight_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"order_id" text,
	"upload_id" integer,
	"row_hash" text NOT NULL,
	"linked_order_id" text,
	"awb" text,
	"invoice_no" text,
	"invoice_date" date NOT NULL,
	"billed_weight_kg" double precision,
	"zone" text,
	"forward" integer,
	"rto" integer,
	"cod_fee" integer,
	"total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"version" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	"headers" jsonb NOT NULL,
	"header_signature" text NOT NULL,
	"engine" text NOT NULL,
	"model" text,
	"note" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"orphan_kind" text NOT NULL,
	"orphan_row_id" integer NOT NULL,
	"partner" text,
	"order_id_hint" text,
	"awb" text,
	"amount" integer,
	"orphan_date" date,
	"candidate_order_id" text,
	"confidence" real NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"order_date" date NOT NULL,
	"value" integer NOT NULL,
	"payment_mode" text NOT NULL,
	"delivery_status" text NOT NULL,
	"status_date" date,
	"courier" text,
	"awb" text,
	"weight_kg" double precision,
	"zone" text,
	"pincode" text,
	"customer_name_masked" text,
	"customer_phone_masked" text,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_code" text NOT NULL,
	"version" integer NOT NULL,
	"card" jsonb NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_results" (
	"order_id" text PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"channel" text NOT NULL,
	"partner" text NOT NULL,
	"status" text NOT NULL,
	"order_date" date NOT NULL,
	"value" integer NOT NULL,
	"payment_mode" text NOT NULL,
	"delivery_status" text NOT NULL,
	"expected" integer NOT NULL,
	"received" integer NOT NULL,
	"difference" integer NOT NULL,
	"tcs" integer NOT NULL,
	"tds" integer NOT NULL,
	"expected_freight" integer,
	"billed_freight" integer,
	"due_date" date,
	"at_risk" integer NOT NULL,
	"risk_since" date,
	"issues" jsonb NOT NULL,
	"expected_lines" jsonb NOT NULL,
	"received_lines" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recon_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"timings" jsonb,
	"stats" jsonb,
	"triggered_by" integer,
	"trigger" text
);
--> statement-breakpoint
CREATE TABLE "return_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text,
	"awb" text,
	"scanned_at" date NOT NULL,
	"condition" text,
	"upload_id" integer,
	"row_hash" text NOT NULL,
	"linked_order_id" text
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"order_id" text,
	"upload_id" integer,
	"row_hash" text NOT NULL,
	"linked_order_id" text,
	"settlement_ref" text,
	"settlement_date" date NOT NULL,
	"gross" integer,
	"commission" integer,
	"fixed_fee" integer,
	"shipping_fee" integer,
	"other_fees" integer,
	"tcs" integer DEFAULT 0 NOT NULL,
	"tds" integer DEFAULT 0 NOT NULL,
	"net" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_code" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"mapping_version_id" integer,
	"file_name" text NOT NULL,
	"file_hash" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"rejected_sample" jsonb,
	"status" text DEFAULT 'processing' NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_versions" ADD CONSTRAINT "mapping_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_versions" ADD CONSTRAINT "mapping_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestions" ADD CONSTRAINT "match_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_partner_code_partners_code_fk" FOREIGN KEY ("partner_code") REFERENCES "public"."partners"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_runs" ADD CONSTRAINT "recon_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_partner_code_partners_code_fk" FOREIGN KEY ("partner_code") REFERENCES "public"."partners"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_mapping_version_id_mapping_versions_id_fk" FOREIGN KEY ("mapping_version_id") REFERENCES "public"."mapping_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_order_type" ON "claims" USING btree ("order_id","type");--> statement-breakpoint
CREATE INDEX "claims_partner_status" ON "claims" USING btree ("partner","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_remittances_row_hash" ON "cod_remittances" USING btree ("row_hash");--> statement-breakpoint
CREATE INDEX "cod_remittances_awb" ON "cod_remittances" USING btree ("awb");--> statement-breakpoint
CREATE UNIQUE INDEX "freight_lines_row_hash" ON "freight_lines" USING btree ("row_hash");--> statement-breakpoint
CREATE INDEX "freight_lines_awb" ON "freight_lines" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "login_attempts_email_at" ON "login_attempts" USING btree ("email","at");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_versions_source_version" ON "mapping_versions" USING btree ("source_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "match_suggestions_unique" ON "match_suggestions" USING btree ("orphan_kind","orphan_row_id","candidate_order_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "match_suggestions_status" ON "match_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_awb" ON "orders" USING btree ("awb");--> statement-breakpoint
CREATE INDEX "orders_channel" ON "orders" USING btree ("channel");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_cards_partner_version" ON "rate_cards" USING btree ("partner_code","version");--> statement-breakpoint
CREATE INDEX "recon_results_status" ON "recon_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recon_results_partner" ON "recon_results" USING btree ("partner");--> statement-breakpoint
CREATE INDEX "recon_results_risk" ON "recon_results" USING btree ("at_risk");--> statement-breakpoint
CREATE UNIQUE INDEX "return_scans_row_hash" ON "return_scans" USING btree ("row_hash");--> statement-breakpoint
CREATE INDEX "settlements_order" ON "settlements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_row_hash" ON "settlements" USING btree ("row_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_partner_kind" ON "sources" USING btree ("partner_code","kind");