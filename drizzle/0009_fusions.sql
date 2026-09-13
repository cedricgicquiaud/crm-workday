CREATE TABLE "object_redirect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_redirect_from_uq" UNIQUE("object_type","from_id")
);
--> statement-breakpoint
CREATE INDEX "object_redirect_to_idx" ON "object_redirect" USING btree ("object_type","to_id");