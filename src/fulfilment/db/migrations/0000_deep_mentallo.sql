CREATE SCHEMA IF NOT EXISTS "fulfilment";
--> statement-breakpoint
CREATE TABLE "fulfilment"."shipment" (
	"order_id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"status" text NOT NULL,
	"packed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_shipment_id_unique" UNIQUE("shipment_id")
);
