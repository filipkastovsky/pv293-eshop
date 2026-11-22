CREATE SCHEMA IF NOT EXISTS "catalog";
--> statement-breakpoint
CREATE TABLE "catalog"."product" (
	"sku" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
