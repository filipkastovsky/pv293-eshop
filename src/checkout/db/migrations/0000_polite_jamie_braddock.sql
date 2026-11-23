CREATE SCHEMA IF NOT EXISTS "checkout";
--> statement-breakpoint
CREATE TYPE "checkout"."order_status" AS ENUM('created', 'placed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "checkout"."carts" (
	"id" text PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"checked_out" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout"."orders" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"status" "checkout"."order_status" NOT NULL,
	"customer_email" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total_in_cents" bigint NOT NULL,
	CONSTRAINT "orders_cart_id_unique" UNIQUE("cart_id")
);
--> statement-breakpoint
ALTER TABLE "checkout"."orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "checkout"."carts"("id") ON DELETE no action ON UPDATE no action;