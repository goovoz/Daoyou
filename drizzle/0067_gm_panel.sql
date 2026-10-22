CREATE TABLE "wanjiedaoyou_gm_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_email" text,
	"action" varchar(64) NOT NULL,
	"request_id" uuid,
	"target_user_id" uuid,
	"target_cultivator_id" uuid,
	"target_cultivator_name" varchar(100),
	"reason" varchar(200) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_redeem_codes" ADD COLUMN "bound_user_id" uuid;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_redeem_codes" ADD COLUMN "bound_cultivator_id" uuid;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_redeem_codes" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_redeem_codes" ADD COLUMN "note" varchar(200);--> statement-breakpoint
CREATE INDEX "gm_audit_actor_created_idx" ON "wanjiedaoyou_gm_audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "gm_audit_target_created_idx" ON "wanjiedaoyou_gm_audit_logs" USING btree ("target_cultivator_id","created_at");--> statement-breakpoint
CREATE INDEX "gm_audit_created_idx" ON "wanjiedaoyou_gm_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "redeem_codes_bound_user_idx" ON "wanjiedaoyou_redeem_codes" USING btree ("bound_user_id");--> statement-breakpoint
CREATE INDEX "redeem_codes_batch_idx" ON "wanjiedaoyou_redeem_codes" USING btree ("batch_id");