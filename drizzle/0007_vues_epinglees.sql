CREATE TABLE "pinned_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"view_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pinned_view_user_view_uq" UNIQUE("user_id","view_id")
);
--> statement-breakpoint
ALTER TABLE "pinned_view" ADD CONSTRAINT "pinned_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_view" ADD CONSTRAINT "pinned_view_view_id_saved_view_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_view"("id") ON DELETE cascade ON UPDATE no action;