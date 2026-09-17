CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_person_id" uuid,
	"need" text,
	"target_daily_rate" numeric(7, 2),
	"estimated_days" integer,
	"desired_start" date,
	"expected_close" date NOT NULL,
	"stage" text DEFAULT 'nouveau_besoin' NOT NULL,
	"closed_at" timestamp with time zone,
	"loss_reason" text,
	"loss_comment" text,
	"lead_id" uuid,
	"owner_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunity_consultant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"result" text DEFAULT 'propose' NOT NULL,
	"proposed_daily_rate" numeric(7, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_consultant_unique" UNIQUE("opportunity_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"module" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_module_unique" UNIQUE("opportunity_id","module")
);
--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_contact_person_id_person_id_fk" FOREIGN KEY ("contact_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_consultant" ADD CONSTRAINT "opportunity_consultant_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_consultant" ADD CONSTRAINT "opportunity_consultant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_module" ADD CONSTRAINT "opportunity_module_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_updated_at_idx" ON "opportunity" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "opportunity_owner_id_idx" ON "opportunity" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "opportunity_company_id_idx" ON "opportunity" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "opportunity_contact_person_id_idx" ON "opportunity" USING btree ("contact_person_id");--> statement-breakpoint
CREATE INDEX "opportunity_lead_id_idx" ON "opportunity" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "opportunity_consultant_opportunity_id_idx" ON "opportunity_consultant" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_consultant_person_id_idx" ON "opportunity_consultant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "opportunity_module_opportunity_id_idx" ON "opportunity_module" USING btree ("opportunity_id");