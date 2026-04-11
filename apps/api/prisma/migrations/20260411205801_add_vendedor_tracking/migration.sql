-- AlterTable
ALTER TABLE "leads_tracking" ADD COLUMN     "campania" TEXT,
ADD COLUMN     "vendedor_id" TEXT;

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendedores_tenant_id_idx" ON "vendedores"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_tenant_id_email_key" ON "vendedores"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_tracking" ADD CONSTRAINT "leads_tracking_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
