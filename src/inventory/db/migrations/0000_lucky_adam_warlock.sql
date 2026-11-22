CREATE SCHEMA IF NOT EXISTS "inventory";
--> statement-breakpoint
CREATE TABLE "inventory"."reservation" (
	"order_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"lines" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."stock" (
	"sku" text PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL
);
