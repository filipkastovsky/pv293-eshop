CREATE SCHEMA IF NOT EXISTS "checkout";
--> statement-breakpoint
CREATE TABLE "checkout"."cart_lines" (
	"cart_id" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "cart_lines_cart_id_sku_pk" PRIMARY KEY("cart_id","sku")
);
--> statement-breakpoint
CREATE TABLE "checkout"."carts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout"."events" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "checkout"."events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"stream_type" text NOT NULL,
	"stream_id" text NOT NULL,
	"version" integer,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkout"."cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "checkout"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_stream_version_idx" ON "checkout"."events" USING btree ("stream_type","stream_id","version");--> statement-breakpoint
CREATE INDEX "events_unpublished_idx" ON "checkout"."events" USING btree ("seq") WHERE "checkout"."events"."published_at" is null;