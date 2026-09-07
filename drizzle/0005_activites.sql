CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"parent_type" text,
	"parent_id" uuid,
	"type" text NOT NULL,
	"body" text,
	"title" text,
	"occurred_on" date,
	"due_date" date,
	"assignee_id" text,
	"done_at" timestamp with time zone,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_object_idx" ON "activity" USING btree ("object_type","object_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_parent_idx" ON "activity" USING btree ("parent_type","parent_id","created_at");