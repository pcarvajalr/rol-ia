-- AlterTable
ALTER TABLE "leads_tracking" ADD COLUMN     "external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "leads_tracking_tenant_id_external_id_fuente_key" ON "leads_tracking"("tenant_id", "external_id", "fuente");
