CREATE TABLE "consultant_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"module" text NOT NULL,
	"certified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultant_module_unique" UNIQUE("profile_id","module")
);
--> statement-breakpoint
CREATE TABLE "consultant_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text NOT NULL,
	"daily_cost" numeric(10, 2),
	"available_from" date,
	"unavailable" boolean DEFAULT false NOT NULL,
	"unavailable_reason" text,
	"years_experience" integer,
	"languages" text,
	"cv_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultant_profile_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "profiles" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "profiles" SET DATA TYPE text[] USING CASE WHEN "profiles" IS NULL OR "profiles" IN ('', 'aucun') THEN '{}'::text[] ELSE ARRAY["profiles"] END;--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "profiles" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "billing_company_id" uuid;--> statement-breakpoint
ALTER TABLE "consultant_module" ADD CONSTRAINT "consultant_module_profile_id_consultant_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."consultant_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_profile" ADD CONSTRAINT "consultant_profile_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultant_module_profile_id_idx" ON "consultant_module" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_billing_company_id_company_id_fk" FOREIGN KEY ("billing_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_billing_company_id_idx" ON "person" USING btree ("billing_company_id");