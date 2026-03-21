-- AlterTable
ALTER TABLE "leads_tracking" ADD COLUMN     "crm_status_inicial" TEXT,
ADD COLUMN     "semaphore_color" TEXT,
ADD COLUMN     "semaphore_time_ms" BIGINT;

-- CreateTable
CREATE TABLE "crm_state_mapping" (
    "id" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform_slug" TEXT NOT NULL,
    "crm_status" TEXT NOT NULL,
    "cat_estado_gestion_id" INTEGER NOT NULL,

    CONSTRAINT "crm_state_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_request_log" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "crm_status" TEXT,
    "lead_id" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_request_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_state_mapping_tenant_id_idx" ON "crm_state_mapping"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_state_mapping_tenant_id_platform_slug_crm_status_key" ON "crm_state_mapping"("tenant_id", "platform_slug", "crm_status");

-- CreateIndex
CREATE INDEX "webhook_request_log_tenant_id_timestamp_idx" ON "webhook_request_log"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "webhook_request_log_tenant_id_external_id_idx" ON "webhook_request_log"("tenant_id", "external_id");

-- AddForeignKey
ALTER TABLE "crm_state_mapping" ADD CONSTRAINT "crm_state_mapping_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_state_mapping" ADD CONSTRAINT "crm_state_mapping_cat_estado_gestion_id_fkey" FOREIGN KEY ("cat_estado_gestion_id") REFERENCES "cat_estados_gestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_request_log" ADD CONSTRAINT "webhook_request_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_request_log" ADD CONSTRAINT "webhook_request_log_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads_tracking"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;
