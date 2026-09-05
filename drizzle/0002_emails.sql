CREATE TABLE "cabinet_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_template" (
	"key" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"required_variables" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
