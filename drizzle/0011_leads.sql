CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text GENERATED ALWAYS AS (CASE WHEN btrim(coalesce("first_name", '') || ' ' || coalesce("last_name", '')) = '' THEN coalesce("company_name", '') ELSE btrim(coalesce("first_name", '') || ' ' || coalesce("last_name", '')) || CASE WHEN coalesce("company_name", '') = '' THEN '' ELSE ' · ' || "company_name" END END) STORED NOT NULL,
	"first_name" text,
	"last_name" text,
	"job_title" text,
	"company_name" text,
	"email" text,
	"phone" text,
	"linkedin" text,
	"need" text,
	"origin" text NOT NULL,
	"score" integer,
	"stage" text DEFAULT 'nouveau' NOT NULL,
	"converted_at" timestamp with time zone,
	"converted_person_id" uuid,
	"converted_company_id" uuid,
	"owner_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_converted_person_id_person_id_fk" FOREIGN KEY ("converted_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_converted_company_id_company_id_fk" FOREIGN KEY ("converted_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_updated_at_idx" ON "lead" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "lead_created_at_idx" ON "lead" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_owner_id_idx" ON "lead" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lead_email_idx" ON "lead" USING btree ("email");--> statement-breakpoint
CREATE INDEX "lead_converted_person_id_idx" ON "lead" USING btree ("converted_person_id");--> statement-breakpoint
CREATE INDEX "lead_converted_company_id_idx" ON "lead" USING btree ("converted_company_id");