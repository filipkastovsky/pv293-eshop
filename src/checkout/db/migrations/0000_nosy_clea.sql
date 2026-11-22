CREATE SCHEMA IF NOT EXISTS "checkout";
--> statement-breakpoint
CREATE TABLE "checkout"."cart" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"items" jsonb NOT NULL,
	"order_id" text,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout"."order" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"status" text NOT NULL,
	"customer_email" text NOT NULL,
	"lines" jsonb NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "order_cart_id_unique" UNIQUE("cart_id")
);
