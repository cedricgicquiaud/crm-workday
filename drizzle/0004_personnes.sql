CREATE TABLE "contact_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"job_title" text,
	"decision_role" text DEFAULT 'non_precise' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_profile_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"name" text GENERATED ALWAYS AS ("first_name" || ' ' || "last_name") STORED NOT NULL,
	"email" text,
	"phone" text,
	"linkedin" text,
	"notes" text,
	"profiles" text DEFAULT 'aucun' NOT NULL,
	"company_id" uuid,
	"owner_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_email_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "contact_profile" ADD CONSTRAINT "contact_profile_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_email" ADD CONSTRAINT "person_email_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_unique_idx" ON "person" USING btree ("email");--> statement-breakpoint
CREATE INDEX "person_updated_at_idx" ON "person" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "person_owner_id_idx" ON "person" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "person_company_id_idx" ON "person" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "person_email_person_id_idx" ON "person_email" USING btree ("person_id");