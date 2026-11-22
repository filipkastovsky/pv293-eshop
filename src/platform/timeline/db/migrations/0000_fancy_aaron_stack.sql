CREATE SCHEMA IF NOT EXISTS "platform";
--> statement-breakpoint
CREATE TABLE "platform"."timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "platform"."timeline_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
