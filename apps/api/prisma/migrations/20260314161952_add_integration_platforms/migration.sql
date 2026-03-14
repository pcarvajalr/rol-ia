-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "vault_pin_hash" TEXT;

-- CreateTable
CREATE TABLE "integration_platforms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_fields" (
    "id" UUID NOT NULL,
    "platform_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" TEXT NOT NULL DEFAULT 'secret',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "integration_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform_id" UUID NOT NULL,
    "credentials_encrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_platforms_slug_key" ON "integration_platforms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "integration_fields_platform_id_field_key_key" ON "integration_fields"("platform_id", "field_key");

-- CreateIndex
CREATE INDEX "tenant_integrations_tenant_id_idx" ON "tenant_integrations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_tenant_id_platform_id_key" ON "tenant_integrations"("tenant_id", "platform_id");

-- AddForeignKey
ALTER TABLE "integration_fields" ADD CONSTRAINT "integration_fields_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "integration_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "integration_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
