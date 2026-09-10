CREATE TABLE "custom_field_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"values" text[] DEFAULT '{}' NOT NULL,
	"retired_values" text[] DEFAULT '{}' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_definition_object_label_uq" UNIQUE("object_type","label")
);
--> statement-breakpoint
CREATE TABLE "custom_field_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_value_definition_object_uq" UNIQUE("definition_id","object_id")
);
--> statement-breakpoint
ALTER TABLE "custom_field_definition" ADD CONSTRAINT "custom_field_definition_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_definition_id_custom_field_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."custom_field_definition"("id") ON DELETE cascade ON UPDATE no action;